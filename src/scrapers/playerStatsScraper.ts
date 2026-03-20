import type { Page } from 'playwright';
import type { PlayerStats, SessionState } from '../types.js';
import { getSeasonContext } from '../fetchers/reportsCsvFetcher.js';

export async function scrapePlayerStats(
  page: Page,
  _session: SessionState,
  teamId: string,
  _onSessionUpdate: (s: SessionState) => void,
  playerNameFilter?: string
): Promise<PlayerStats[]> {
  const ctx = await getSeasonContext(page, teamId);
  const gameParam = ctx.uniqueGameIds.join(',');
  const periods = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';

  const qs = [
    `A%5B%5D=ALL`,
    `GRP=PLAYER`,
    gameParam ? `G%5B%5D=${encodeURIComponent(gameParam)}` : '',
    `P%5B%5D=${encodeURIComponent(periods)}`,
    `Q=all-season`,
    `S=${ctx.seasonId}`,
    `SD=${teamId}`,
    `SHT%5B%5D=ALL`,
    `SST=GOALPERCENTAGE`,
    `ST=0-Goals`,
    `STYPE=TOTALS`,
    `T=${teamId}`,
    `Z=ZONE`,
  ].filter(Boolean).join('&');

  const url = `https://www.hudl.com/reports/teams/${teamId}/stats?${qs}`;
  console.error(`[player-stats] Navigating to: ${url}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Offense'),
    { timeout: 20000 }
  );
  await page.waitForTimeout(1000);

  const text = await page.locator('body').innerText();
  const players = parseAllStats(text);

  console.error(`[player-stats] Parsed ${players.length} players`);

  if (playerNameFilter) {
    const lower = playerNameFilter.toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(lower));
  }

  return players.sort((a, b) => b.points - a.points);
}

// ── Types ─────────────────────────────────────────────────────────────────────

// Section name → map of column abbreviation → value string, per player index
type SectionData = Map<string, string[]>; // colName → [player0val, player1val, ...]

// ── Main parser ───────────────────────────────────────────────────────────────

function parseAllStats(text: string): PlayerStats[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // ── 1. Parse player list ─────────────────────────────────────────────────
  const jerseyHeaderIdx = lines.findIndex((l) => l === '#');
  const offenseIdx = lines.findIndex((l) => l === 'Offense');
  if (jerseyHeaderIdx === -1 || offenseIdx === -1) return [];

  const playerListLines = lines.slice(jerseyHeaderIdx + 3, offenseIdx);
  const players: Array<{ number: string; name: string; gamesPlayed: number }> = [];
  for (let i = 0; i + 2 < playerListLines.length; i += 3) {
    const jersey = playerListLines[i];
    const name = playerListLines[i + 1];
    const gp = parseInt(playerListLines[i + 2], 10) || 0;
    if (/^\d+$/.test(jersey) && name && name.length > 1) {
      players.push({ number: jersey, name, gamesPlayed: gp });
    }
  }
  if (players.length === 0) return [];
  const numPlayers = players.length;

  // ── 2. Find all stat sections ─────────────────────────────────────────────
  // A section starts with a title-case word/phrase, followed by a tab-separated header line.
  // Known section names on Hudl lacrosse reports:
  const knownSections = ['Offense', 'Clears and Rides', 'Face-Offs', 'Turnovers', 'Defense', 'Penalties'];

  // Collect section start indices (in lines array)
  const sectionStarts: Array<{ name: string; lineIdx: number }> = [];
  for (const sectionName of knownSections) {
    const idx = lines.findIndex((l) => l === sectionName);
    if (idx !== -1) sectionStarts.push({ name: sectionName, lineIdx: idx });
  }
  sectionStarts.sort((a, b) => a.lineIdx - b.lineIdx);

  // ── 3. For each section, extract column data per player ───────────────────
  const allSections = new Map<string, SectionData>();

  for (let si = 0; si < sectionStarts.length; si++) {
    const { name, lineIdx } = sectionStarts[si];
    const nextSectionIdx = si + 1 < sectionStarts.length ? sectionStarts[si + 1].lineIdx : lines.length;

    // Line after section name = tab-separated column headers
    const headerLine = lines[lineIdx + 1] ?? '';
    const colHeaders = headerLine.split('\t').map((h) => h.trim()).filter((h) => h);
    if (colHeaders.length === 0) continue;

    const numCols = colHeaders.length;
    const valueLines = lines.slice(lineIdx + 2, nextSectionIdx);

    // Build per-column arrays
    const sectionData: SectionData = new Map();
    for (const col of colHeaders) sectionData.set(col, []);

    for (let playerIdx = 0; playerIdx < numPlayers; playerIdx++) {
      const start = playerIdx * numCols;
      for (let c = 0; c < numCols; c++) {
        const val = valueLines[start + c] ?? '0';
        sectionData.get(colHeaders[c])!.push(val);
      }
    }

    allSections.set(name, sectionData);
  }

  // ── 4. Map section data to PlayerStats ────────────────────────────────────
  const offense = allSections.get('Offense') ?? new Map();
  const faceoffs = allSections.get('Face-Offs') ?? new Map();
  const turnovers = allSections.get('Turnovers') ?? new Map();
  const defense = allSections.get('Defense') ?? new Map();
  const penalties = allSections.get('Penalties') ?? new Map();

  const col = (section: SectionData, key: string, i: number) =>
    section.get(key)?.[i] ?? '0';
  const int = (s: string) => parseInt(s, 10) || 0;

  return players.map((player, i) => ({
    playerId: `${player.name}-${player.number}`,
    name: player.name,
    number: player.number,
    position: '',
    gamesPlayed: player.gamesPlayed,
    // Offense
    goals: int(col(offense, 'G', i)),
    assists: int(col(offense, 'A', i)),
    points: int(col(offense, 'P', i)) || int(col(offense, 'G', i)) + int(col(offense, 'A', i)),
    shots: int(col(offense, 'S', i)),
    shotsOnTarget: int(col(offense, 'SOT', i)),
    shotPct: col(offense, 'S%', i),
    groundBalls: int(col(offense, 'GB', i)),
    extraManGoals: int(col(offense, 'EMOG', i)),
    // Face-offs
    faceoffs: int(col(faceoffs, 'FO', i)),
    faceoffWins: int(col(faceoffs, 'FOW', i)),
    faceoffLosses: int(col(faceoffs, 'FOL', i)),
    faceoffPct: col(faceoffs, 'FO%', i),
    // Turnovers
    turnovers: int(col(turnovers, 'T', i)),
    forcedTurnovers: int(col(turnovers, 'FT', i)),
    unforcedTurnovers: int(col(turnovers, 'UT', i)),
    // Defense
    causedTurnovers: int(col(defense, 'CT', i)),
    goalsAllowed: int(col(defense, 'GA', i)),
    saves: int(col(defense, 'SV', i)),
    savePct: col(defense, 'SV%', i),
    // Penalties
    penalties: int(col(penalties, 'P', i)),
  }));
}
