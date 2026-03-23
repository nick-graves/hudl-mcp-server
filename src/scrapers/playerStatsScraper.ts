import type { Page } from 'playwright';
import type { PlayerStats, SessionState } from '../types.js';
import { getSeasonContext } from '../fetchers/reportsCsvFetcher.js';

export async function scrapePlayerStats(
  page: Page,
  _session: SessionState,
  teamId: string,
  _onSessionUpdate: (s: SessionState) => void,
  playerNameFilter?: string,
  seasonId?: string
): Promise<PlayerStats[]> {
  const ctx = await getSeasonContext(page, teamId, seasonId);
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
  console.error(`[player-stats] Expecting ${ctx.uniqueGameIds.length} games for season ${ctx.seasonId}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Offense'),
    { timeout: 20000 }
  );
  await page.waitForTimeout(1500);

  // Log the actual URL after navigation — a redirect here means Hudl ignored
  // the season/game parameters and fell back to the current season
  const landedUrl = page.url();
  if (landedUrl !== url) {
    console.error(`[player-stats] WARNING: Hudl redirected to a different URL`);
    console.error(`[player-stats]   expected: ${url}`);
    console.error(`[player-stats]   landed:   ${landedUrl}`);
  }

  const text = await page.locator('body').innerText();

  // Log page preview so we can diagnose parse failures
  console.error('[player-stats] Page text preview (first 80 lines):\n' +
    text.split('\n').slice(0, 80).join('\n'));

  // Detect how many games the page actually loaded
  const gamesMatch = text.match(/(\d+)\s+Games?\b/i);
  const pageGameCount = gamesMatch ? parseInt(gamesMatch[1], 10) : null;
  if (pageGameCount !== null && pageGameCount !== ctx.uniqueGameIds.length) {
    console.error(
      `[player-stats] WARNING: page shows ${pageGameCount} games but expected ` +
      `${ctx.uniqueGameIds.length} — Hudl may have loaded the wrong season`
    );
  } else if (pageGameCount !== null) {
    console.error(`[player-stats] Page game count confirmed: ${pageGameCount}`);
  }

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
    const name   = playerListLines[i + 1];
    const gp     = parseInt(playerListLines[i + 2], 10) || 0;
    // jersey must be digits; name must contain at least one letter (filters
    // out phantom entries like "22" or "15" that land in the name slot when
    // extra GP-breakdown rows shift the triplet alignment on historical seasons)
    if (/^\d+$/.test(jersey) && /[a-zA-Z]/.test(name) && name.length > 1) {
      players.push({ number: jersey, name, gamesPlayed: gp });
    }
  }
  if (players.length === 0) return [];
  const numPlayers = players.length;

  console.error(
    `[player-stats] Player list: ${numPlayers} players — ` +
    `first: ${players[0]?.number} ${players[0]?.name}, ` +
    `last: ${players[numPlayers - 1]?.number} ${players[numPlayers - 1]?.name}`
  );

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
  //
  // For historical seasons Hudl renders period-breakdown rows (e.g. "1st half",
  // "2nd half") after each player's totals row.  These extra rows are plain
  // numeric values with no label prefix, so content-matching won't find them.
  //
  // Strategy: measure the actual rows-per-player from the total value count,
  // then use a fixed stride so we always land on the totals row for each player.
  //
  // The last section has no explicit end boundary (nextSectionIdx = lines.length),
  // so end-of-page content would inflate the raw count.  We cap it first.

  const MAX_ROWS_PER_PLAYER = 8; // WHOLEGAME + 2 halves + 4 quarters + OT
  const allSections = new Map<string, SectionData>();

  for (let si = 0; si < sectionStarts.length; si++) {
    const { name, lineIdx } = sectionStarts[si];
    const nextSectionIdx =
      si + 1 < sectionStarts.length ? sectionStarts[si + 1].lineIdx : lines.length;

    // Line after section name = tab-separated column headers
    const headerLine = lines[lineIdx + 1] ?? '';
    const colHeaders = headerLine.split('\t').map((h) => h.trim()).filter((h) => h);
    if (colHeaders.length === 0) continue;

    const numCols = colHeaders.length;

    // Cap to prevent end-of-page UI content from inflating the last section
    const maxLines = numPlayers * numCols * MAX_ROWS_PER_PLAYER;
    const rawValueLines = lines.slice(lineIdx + 2, nextSectionIdx).slice(0, maxLines);

    // Detect rows-per-player: if Hudl rendered period breakdowns, the total
    // line count will be a multiple of numPlayers * numCols greater than 1.
    let rowsPerPlayer = 1;
    if (rawValueLines.length > numPlayers * numCols && numPlayers > 0) {
      const ratio = rawValueLines.length / (numPlayers * numCols);
      rowsPerPlayer = Math.min(MAX_ROWS_PER_PLAYER, Math.max(1, Math.round(ratio)));
    }
    const stride = numCols * rowsPerPlayer;

    if (rowsPerPlayer > 1) {
      console.error(
        `[player-stats] Section "${name}": detected ${rowsPerPlayer} rows/player ` +
        `(period breakdown) — stride=${stride}, raw lines=${rawValueLines.length}`
      );
    }

    const sectionData: SectionData = new Map();
    for (const col of colHeaders) sectionData.set(col, []);

    // Read only the first numCols values at each stride offset (the totals row)
    for (let playerIdx = 0; playerIdx < numPlayers; playerIdx++) {
      const start = playerIdx * stride;
      for (let c = 0; c < numCols; c++) {
        sectionData.get(colHeaders[c])!.push(rawValueLines[start + c] ?? '0');
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
