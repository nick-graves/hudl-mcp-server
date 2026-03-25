/**
 * gameStatsScraper.ts
 *
 * Scrapes per-game player stats for a single specified game.
 *
 * The approach:
 *  1. Call getSeasonContext to get all uniqueGameIds for the season.
 *  2. Call scrapeGameResults to get the ordered game list (date / opponent / result).
 *  3. Match the caller-supplied gameIdentifier to one entry in the game list.
 *  4. Sort uniqueGameIds numerically (numeric prefix = Hudl internal event order,
 *     roughly chronological) to align them with the game list order.
 *  5. Navigate to the Hudl stats page with ONLY that one uniqueGameId in G[]=.
 *  6. Parse and return per-game player stats.
 *
 * gameIdentifier can be:
 *   "latest"          – most recent game (default)
 *   "0", "1", ...     – 0-based index, newest first
 *   "Beaverton"       – partial opponent name match (case-insensitive)
 *   "May 18"          – partial date match
 */

import type { Page }          from 'playwright';
import type { PlayerStats, SessionState } from '../types.js';
import { getSeasonContext }    from '../fetchers/reportsCsvFetcher.js';
import { scrapeGameResults }   from './gameResultsScraper.js';

// ── Result type ───────────────────────────────────────────────────────────────

export interface GameStatsResult {
  seasonId:      string;
  uniqueGameId:  string;
  date:          string;
  opponent:      string;
  homeAway:      'home' | 'away' | 'neutral' | 'unknown';
  teamScore:     number;
  opponentScore: number;
  result:        'W' | 'L' | 'T';
  players:       PlayerStats[];
}

// ── Main scraper ──────────────────────────────────────────────────────────────

export async function scrapeGameStats(
  page:              Page,
  session:           SessionState,
  teamId:            string,
  onSessionUpdate:   (s: SessionState) => void,
  gameIdentifier:    string = 'latest',
  seasonId?:         string,
): Promise<GameStatsResult | null> {

  // ── 1. Season context ───────────────────────────────────────────────────────
  const ctx = await getSeasonContext(page, teamId, seasonId);

  if (ctx.uniqueGameIds.length === 0) {
    console.error('[game-stats] No game IDs found for this season — cannot fetch single-game stats');
    return null;
  }

  // ── 2. Full game list ───────────────────────────────────────────────────────
  // scrapeGameResults returns games newest-first.
  const rawGames = await scrapeGameResults(page, session, teamId, onSessionUpdate, undefined, seasonId);

  // Filter out placeholder/sample entries that corrupt the game index
  const allGames = rawGames.filter(g => g.opponent.toLowerCase() !== 'sample game');

  if (allGames.length === 0) {
    console.error('[game-stats] No game results found — cannot identify target game');
    return null;
  }

  // ── 3. Identify the target game ─────────────────────────────────────────────
  // gameIdentifier resolution order:
  //   "latest" | "0"   → index 0  (most recent)
  //   pure number       → 0-based index newest-first, clamped to list length
  //   string            → opponent partial match first, then date partial match,
  //                       then fuzzy opponent match (tolerates minor spelling diffs)
  let targetIndex = 0;

  // ── Fuzzy match helper (Levenshtein distance) ────────────────────────────────
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
  }

  if (gameIdentifier === 'latest') {
    targetIndex = 0;
  } else if (/^\d+$/.test(gameIdentifier)) {
    targetIndex = Math.min(parseInt(gameIdentifier, 10), allGames.length - 1);
  } else {
    const lower      = gameIdentifier.toLowerCase();
    const byOpponent = allGames.findIndex(g => g.opponent.toLowerCase().includes(lower));
    const byDate     = allGames.findIndex(g => g.date.toLowerCase().includes(lower));

    if (byOpponent !== -1) {
      targetIndex = byOpponent;
      // Warn when the same opponent appears more than once in the season
      const allMatches = allGames.filter(g => g.opponent.toLowerCase().includes(lower));
      if (allMatches.length > 1) {
        console.error(
          `[game-stats] WARNING: ${allMatches.length} games match "${gameIdentifier}" ` +
          `(${allMatches.map(g => g.date).join(', ')}) — returning most recent (${allGames[byOpponent].date}). ` +
          `Use a date or numeric index to select a specific game.`
        );
      } else {
        console.error(
          `[game-stats] Matched "${gameIdentifier}" → vs ${allGames[byOpponent].opponent} on ${allGames[byOpponent].date}`
        );
      }
    } else if (byDate !== -1) {
      targetIndex = byDate;
      console.error(
        `[game-stats] Matched "${gameIdentifier}" → ${allGames[byDate].date} vs ${allGames[byDate].opponent}`
      );
    } else {
      // ── Fuzzy fallback: find closest opponent name by Levenshtein distance ──
      const fuzzyThreshold = Math.max(2, Math.floor(lower.length * 0.25)); // allow ~25% edit distance
      let bestIdx  = -1;
      let bestDist = Infinity;

      for (let i = 0; i < allGames.length; i++) {
        const opponentLower = allGames[i].opponent.toLowerCase();
        // Also try matching the query against each word of the opponent name
        const dist = Math.min(
          levenshtein(lower, opponentLower),
          ...opponentLower.split(/\s+/).map(word => levenshtein(lower, word))
        );
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }

      if (bestIdx !== -1 && bestDist <= fuzzyThreshold) {
        targetIndex = bestIdx;
        console.error(
          `[game-stats] Fuzzy matched "${gameIdentifier}" → vs ${allGames[bestIdx].opponent} on ${allGames[bestIdx].date} (edit distance: ${bestDist})`
        );
      } else {
        // No match — throw a descriptive error so the AI can recover
        const available = allGames.map(g => `  ${g.date} vs ${g.opponent}`).join('\n');
        throw new Error(
          `No game found matching "${gameIdentifier}" in this season.\n` +
          `Available games:\n${available}\n` +
          `Tip: use an exact date (e.g. "Apr 18") or full opponent name to target a specific game.`
        );
      }
    }
  }

  const targetGame = allGames[targetIndex];
  console.error(
    `[game-stats] Target: index ${targetIndex} of ${allGames.length} — ` +
    `${targetGame.date} vs ${targetGame.opponent} (${targetGame.result} ${targetGame.teamScore}-${targetGame.opponentScore})`
  );

  // ── 4. Map target game → uniqueGameId ───────────────────────────────────────
  // Strategy A: if the events API returned date metadata, match by date directly.
  // Strategy B: fall back to numeric-prefix sort (approximate, may be wrong).
  let chosenId: string | undefined;

  const eventsWithDates = (ctx.gameEvents ?? []).filter(e => e.date);

  if (eventsWithDates.length > 0) {
    // Parse "Apr 4" style date (no year) into month+day for comparison
    const MONTHS: Record<string, number> = {
      jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
      jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };
    function parseShortDate(s: string): { month: number; day: number } | null {
      const m = s.trim().match(/^(\w{3,})\s+(\d{1,2})$/i);
      if (!m) return null;
      const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
      return month ? { month, day: parseInt(m[2], 10) } : null;
    }

    const targetParsed = parseShortDate(targetGame.date);

    if (targetParsed) {
      const match = eventsWithDates.find(e => {
        const d = new Date(e.date!);
        if (isNaN(d.getTime())) return false;
        return d.getMonth() + 1 === targetParsed.month &&
               d.getDate()       === targetParsed.day;
      });

      if (match) {
        chosenId = match.uniqueGameId;
        console.error(
          `[game-stats] Date-matched uniqueGameId ${chosenId} for ${targetGame.date} vs ${targetGame.opponent}`
        );
      } else {
        console.error(
          `[game-stats] Date match failed for "${targetGame.date}" — events have dates: ` +
          eventsWithDates.slice(0, 5).map(e => e.date).join(', ')
        );
      }
    }
  }

  if (!chosenId) {
    // Strategy B: sort uniqueGameIds by numeric prefix descending (newest first)
    // and align with the game results list by index.  This is approximate and
    // can fail when event IDs are non-sequential — date matching above is preferred.
    console.error('[game-stats] Falling back to numeric-prefix index alignment');
    const idsNewestFirst = [...ctx.uniqueGameIds].sort((a, b) => {
      const nA = parseInt(a.split('-')[0], 10) || 0;
      const nB = parseInt(b.split('-')[0], 10) || 0;
      return nB - nA;
    });
    chosenId = idsNewestFirst[targetIndex];
  }

  if (!chosenId) {
    console.error(`[game-stats] Could not resolve uniqueGameId for index ${targetIndex} (have ${ctx.uniqueGameIds.length} IDs)`);
    return null;
  }

  console.error(`[game-stats] Resolved uniqueGameId: ${chosenId}`);

  // ── 5. Fetch single-game player stats ───────────────────────────────────────
  const periods = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';
  const qs = [
    `A%5B%5D=ALL`,
    `GRP=PLAYER`,
    `G%5B%5D=${encodeURIComponent(chosenId)}`,    // ← single game only
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
  ].join('&');

  const url = `https://www.hudl.com/reports/teams/${teamId}/stats?${qs}`;
  console.error(`[game-stats] Navigating to single-game stats page: ${url}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Offense'),
    { timeout: 20000 }
  );
  await page.waitForTimeout(1000);

  const text    = await page.locator('body').innerText();
  const players = parsePlayerStats(text);

  console.error(`[game-stats] Parsed ${players.length} players for single-game view`);

  return {
    seasonId:      ctx.seasonId,
    uniqueGameId:  chosenId,
    date:          targetGame.date,
    opponent:      targetGame.opponent,
    homeAway:      targetGame.homeAway,
    teamScore:     targetGame.teamScore,
    opponentScore: targetGame.opponentScore,
    result:        targetGame.result,
    players,
  };
}

// ── Player stat parser ────────────────────────────────────────────────────────
// TODO: extract to src/scrapers/playerStatsParser.ts and share with
//       playerStatsScraper.ts to eliminate duplication.
//       For Step 1 (isolated scraper, no existing files modified) this
//       intentional copy is acceptable.

type SectionData = Map<string, string[]>;

function parsePlayerStats(text: string): PlayerStats[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const jerseyIdx  = lines.findIndex(l => l === '#');
  const offenseIdx = lines.findIndex(l => l === 'Offense');
  if (jerseyIdx === -1 || offenseIdx === -1) return [];

  const playerListLines = lines.slice(jerseyIdx + 3, offenseIdx);
  const players: Array<{ number: string; name: string; gamesPlayed: number }> = [];

  for (let i = 0; i + 2 < playerListLines.length; i += 3) {
    const jersey = playerListLines[i];
    const name   = playerListLines[i + 1];
    const gp     = parseInt(playerListLines[i + 2], 10) || 0;
    if (/^\d+$/.test(jersey) && name && name.length > 1) {
      players.push({ number: jersey, name, gamesPlayed: gp });
    }
  }
  if (players.length === 0) return [];

  const numPlayers = players.length;
  const knownSections = ['Offense', 'Clears and Rides', 'Face-Offs', 'Turnovers', 'Defense', 'Penalties'];

  const sectionStarts: Array<{ name: string; lineIdx: number }> = [];
  for (const s of knownSections) {
    const idx = lines.findIndex(l => l === s);
    if (idx !== -1) sectionStarts.push({ name: s, lineIdx: idx });
  }
  sectionStarts.sort((a, b) => a.lineIdx - b.lineIdx);

  const allSections = new Map<string, SectionData>();

  for (let si = 0; si < sectionStarts.length; si++) {
    const { name, lineIdx } = sectionStarts[si];
    const nextIdx  = si + 1 < sectionStarts.length ? sectionStarts[si + 1].lineIdx : lines.length;
    const hdrLine  = lines[lineIdx + 1] ?? '';
    const cols     = hdrLine.split('\t').map(h => h.trim()).filter(h => h);
    if (cols.length === 0) continue;

    const valueLines = lines.slice(lineIdx + 2, nextIdx);
    const sec: SectionData = new Map(cols.map(c => [c, []]));

    for (let pi = 0; pi < numPlayers; pi++) {
      const start = pi * cols.length;
      for (let c = 0; c < cols.length; c++) {
        sec.get(cols[c])!.push(valueLines[start + c] ?? '0');
      }
    }
    allSections.set(name, sec);
  }

  const offense   = allSections.get('Offense')         ?? new Map();
  const faceoffs  = allSections.get('Face-Offs')        ?? new Map();
  const turnovers = allSections.get('Turnovers')        ?? new Map();
  const defense   = allSections.get('Defense')          ?? new Map();
  const penalties = allSections.get('Penalties')        ?? new Map();

  const col = (sec: SectionData, key: string, i: number) => sec.get(key)?.[i] ?? '0';
  const int = (s: string) => parseInt(s, 10) || 0;

  return players.map((p, i) => ({
    playerId:           `${p.name}-${p.number}`,
    name:               p.name,
    number:             p.number,
    position:           '',
    gamesPlayed:        p.gamesPlayed,
    goals:              int(col(offense,   'G',    i)),
    assists:            int(col(offense,   'A',    i)),
    points:             int(col(offense,   'P',    i)) || int(col(offense, 'G', i)) + int(col(offense, 'A', i)),
    shots:              int(col(offense,   'S',    i)),
    shotsOnTarget:      int(col(offense,   'SOT',  i)),
    shotPct:                col(offense,   'S%',   i),
    groundBalls:        int(col(offense,   'GB',   i)),
    extraManGoals:      int(col(offense,   'EMOG', i)),
    faceoffs:           int(col(faceoffs,  'FO',   i)),
    faceoffWins:        int(col(faceoffs,  'FOW',  i)),
    faceoffLosses:      int(col(faceoffs,  'FOL',  i)),
    faceoffPct:             col(faceoffs,  'FO%',  i),
    turnovers:          int(col(turnovers, 'T',    i)),
    forcedTurnovers:    int(col(turnovers, 'FT',   i)),
    unforcedTurnovers:  int(col(turnovers, 'UT',   i)),
    causedTurnovers:    int(col(defense,   'CT',   i)),
    goalsAllowed:       int(col(defense,   'GA',   i)),
    saves:              int(col(defense,   'SV',   i)),
    savePct:                col(defense,   'SV%',  i),
    penalties:          int(col(penalties, 'P',    i)),
    technicalPenalties: int(col(penalties, 'TP',   i)),
    personalPenalties:  int(col(penalties, 'PP',   i)),
  }));
}
