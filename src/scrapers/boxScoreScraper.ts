/**
 * boxScoreScraper.ts
 *
 * Scrapes the team-level box score comparison page from Hudl, showing how
 * Aloha and their opponent compared across all statistical categories.
 *
 * Supports two scopes:
 *   scope = 'game'   — single-game totals (STYPE=TOTALS).
 *                      Resolves the game the same way as gameStatsScraper:
 *                      "latest", 0-based index, opponent name, or date.
 *   scope = 'season' — season averages across all games (STYPE=AVERAGES).
 *                      All game IDs are passed in one request; no looping needed.
 *
 * Phase 1 (raw-dump): categories is always [] and rawText contains the full
 * page body.  Once the page structure is confirmed, the parseBoxScore()
 * function below will be filled in.
 */

import type { Page }        from 'playwright';
import type { BoxScoreResult, SessionState } from '../types.js';
import { getSeasonContext }  from '../fetchers/reportsCsvFetcher.js';
import { scrapeGameResults } from './gameResultsScraper.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIODS = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';

// ── Main scraper ──────────────────────────────────────────────────────────────

export async function scrapeBoxScore(
  page:            Page,
  session:         SessionState,
  teamId:          string,
  onSessionUpdate: (s: SessionState) => void,
  /** 'season' for full-season averages; any other value is treated as a game identifier */
  gameOrSeason:    string = 'latest',
  seasonId?:       string,
): Promise<BoxScoreResult | null> {

  const ctx = await getSeasonContext(page, teamId, seasonId);

  if (ctx.uniqueGameIds.length === 0) {
    console.error('[box-score] No game IDs found for this season');
    return null;
  }

  // ── Season scope ────────────────────────────────────────────────────────────
  if (gameOrSeason === 'season') {
    return scrapeSeasonBoxScore(page, teamId, ctx.seasonId, ctx.uniqueGameIds);
  }

  // ── Game scope ──────────────────────────────────────────────────────────────
  // Strategy: for "latest" and numeric-index identifiers we can resolve the
  // uniqueGameId directly from ctx.gameEvents (already in memory) without
  // calling scrapeGameResults.  This avoids a second getSeasonContext round-trip
  // and a GRP=GAME page navigation that can be flaky early in the season.
  //
  // For opponent-name or date-string identifiers we still need scrapeGameResults
  // because ctx.gameEvents carries only uniqueGameId + date, not opponent names.

  const isIndexBased = gameOrSeason === 'latest' || /^\d+$/.test(gameOrSeason);

  if (isIndexBased) {
    return scrapeGameBoxScoreByIndex(page, teamId, ctx, gameOrSeason);
  }

  // ── Named-game path (opponent name or date string) ──────────────────────────
  // Pass ctx.seasonId so scrapeGameResults skips its own season-discovery step.
  const rawGames = await scrapeGameResults(page, session, teamId, onSessionUpdate, undefined, ctx.seasonId);
  const allGames = rawGames.filter(g => g.opponent.toLowerCase() !== 'sample game');

  if (allGames.length === 0) {
    console.error('[box-score] No game results found — cannot identify target game by name');
    return null;
  }

  const targetIndex = resolveGameIndex(gameOrSeason, allGames);
  if (targetIndex === null) {
    const available = allGames.map(g => `  ${g.date} vs ${g.opponent}`).join('\n');
    throw new Error(
      `No game found matching "${gameOrSeason}" in this season.\n` +
      `Available games:\n${available}\n` +
      `Tip: use an exact date (e.g. "Apr 18"), full opponent name, or numeric index.`
    );
  }

  const targetGame = allGames[targetIndex];
  console.error(
    `[box-score] Target: index ${targetIndex} of ${allGames.length} — ` +
    `${targetGame.date} vs ${targetGame.opponent} (${targetGame.result} ${targetGame.teamScore}-${targetGame.opponentScore})`
  );

  const chosenId = resolveUniqueGameId(ctx, targetGame, targetIndex);
  if (!chosenId) {
    console.error(`[box-score] Could not resolve uniqueGameId for "${gameOrSeason}"`);
    return null;
  }
  console.error(`[box-score] Resolved uniqueGameId: ${chosenId}`);

  const rawText = await navigateAndGetText(page, teamId, ctx.seasonId, chosenId, 'TOTALS');
  const parsed  = parseBoxScorePage(rawText);
  const meta    = extractGameMetadata(rawText);

  return {
    scope:         'game',
    seasonId:      ctx.seasonId,
    uniqueGameId:  chosenId,
    date:          targetGame.date,
    opponent:      meta?.opponent ?? targetGame.opponent,
    homeAway:      meta?.homeAway ?? targetGame.homeAway,
    teamScore:     meta?.teamScore ?? targetGame.teamScore,
    opponentScore: meta?.opponentScore ?? targetGame.opponentScore,
    result:        meta?.result ?? targetGame.result,
    alohaAbbr:     (meta?.alohaAbbr ?? parsed.alohaAbbr) || undefined,
    opponentAbbr:  parsed.opponentAbbr || undefined,
    periodScores:  parsed.periodScores,
    categories:    parsed.categories,
  };
}

// ── Index-based game resolution (no scrapeGameResults needed) ─────────────────

async function scrapeGameBoxScoreByIndex(
  page:         Page,
  teamId:       string,
  ctx:          Awaited<ReturnType<typeof getSeasonContext>>,
  gameOrSeason: string,
): Promise<BoxScoreResult | null> {
  // Sort events newest-first: prefer ISO date sort, fall back to numeric prefix.
  const sortedEvents = [...ctx.gameEvents].sort((a, b) => {
    if (a.date && b.date) {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    const nA = parseInt(a.uniqueGameId.split('-')[0], 10) || 0;
    const nB = parseInt(b.uniqueGameId.split('-')[0], 10) || 0;
    return nB - nA;
  });

  // Fall back to raw uniqueGameIds sorted by numeric prefix if gameEvents is sparse
  const resolvedIds = sortedEvents.length > 0
    ? sortedEvents.map(e => e.uniqueGameId)
    : [...ctx.uniqueGameIds].sort((a, b) => {
        const nA = parseInt(a.split('-')[0], 10) || 0;
        const nB = parseInt(b.split('-')[0], 10) || 0;
        return nB - nA;
      });

  const targetIndex = gameOrSeason === 'latest'
    ? 0
    : Math.min(parseInt(gameOrSeason, 10), resolvedIds.length - 1);

  const chosenId = resolvedIds[targetIndex];
  if (!chosenId) {
    console.error(`[box-score] No game at index ${targetIndex} (have ${resolvedIds.length} games)`);
    return null;
  }

  // Use date from gameEvents if available
  const matchedEvent = sortedEvents[targetIndex];
  const dateStr = matchedEvent?.date
    ? new Date(matchedEvent.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : undefined;

  console.error(`[box-score] Index ${targetIndex} → uniqueGameId ${chosenId}${dateStr ? ` (${dateStr})` : ''}`);

  const rawText = await navigateAndGetText(page, teamId, ctx.seasonId, chosenId, 'TOTALS');

  const parsed   = parseBoxScorePage(rawText);
  const meta     = extractGameMetadata(rawText);

  return {
    scope:         'game',
    seasonId:      ctx.seasonId,
    uniqueGameId:  chosenId,
    date:          meta?.date ?? dateStr,
    opponent:      meta?.opponent,
    homeAway:      meta?.homeAway,
    teamScore:     meta?.teamScore,
    opponentScore: meta?.opponentScore,
    result:        meta?.result,
    alohaAbbr:     (meta?.alohaAbbr ?? parsed.alohaAbbr) || undefined,
    opponentAbbr:  parsed.opponentAbbr || undefined,
    periodScores:  parsed.periodScores,
    categories:    parsed.categories,
  };
}

// ── Season box score ──────────────────────────────────────────────────────────

async function scrapeSeasonBoxScore(
  page:           Page,
  teamId:         string,
  seasonId:       string,
  uniqueGameIds:  string[],
): Promise<BoxScoreResult> {
  // Use Q=all-season with TOTALS (same pattern as teamStatsScraper) to get
  // season-aggregate box score. Passing individual G[]= params causes the page
  // to render only a loading skeleton; omitting them with Q=all-season works.
  const rawText = await navigateAndGetText(page, teamId, seasonId, '', 'TOTALS');

  const parsed = parseBoxScorePage(rawText);

  return {
    scope:         'season',
    seasonId,
    alohaAbbr:     parsed.alohaAbbr   || undefined,
    opponentAbbr:  parsed.opponentAbbr || undefined,
    periodScores:  parsed.periodScores,
    categories:    parsed.categories,
  };
}

// ── Navigation ────────────────────────────────────────────────────────────────

async function navigateAndGetText(
  page:       Page,
  teamId:     string,
  seasonId:   string,
  gameParam:  string,   // single uniqueGameId OR comma-joined list for season
  stype:      'TOTALS' | 'AVERAGES',
): Promise<string> {
  // Season scope: gameParam is empty — use Q=all-season with no G[]= params
  // (same pattern as teamStatsScraper which successfully returns season totals).
  // Game scope: gameParam is a single uniqueGameId.
  const isSeasonScope = gameParam === '';

  const gameParams = isSeasonScope
    ? ''
    : gameParam.split(',')
        .map(id => `G%5B%5D=${encodeURIComponent(id.trim())}`)
        .filter(s => s !== 'G%5B%5D=')   // guard against empty IDs
        .join('&');

  const qs = [
    `A%5B%5D=ALL`,
    `GRP=OVERALL`,
    gameParams,
    `P%5B%5D=${encodeURIComponent(PERIODS)}`,
    `Q=${isSeasonScope ? 'all-season' : 'custom'}`,
    `S=${seasonId}`,
    `SD=${teamId}`,
    `SHT%5B%5D=ALL`,
    `STYPE=${stype}`,
    `T=${teamId}`,
    `Z=ZONE`,
  ].filter(Boolean).join('&');

  const url = `https://www.hudl.com/reports/teams/${teamId}/box-score?${qs}`;
  console.error(`[box-score] Navigating to: ${url}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for actual stat content to render (not just the loading skeleton)
  await page.waitForFunction(
    () => document.body.innerText.includes('Team Stats') || document.body.innerText.includes('Goals'),
    { timeout: 20000 }
  ).catch(() => console.error('[box-score] Timed out waiting for Team Stats — proceeding anyway'));
  await page.waitForTimeout(1000);

  const text = await page.locator('body').innerText();
  console.error('[box-score] Page text preview (first 120 lines):\n' +
    text.split('\n').slice(0, 120).join('\n'));

  return text;
}

// ── Page parsers ──────────────────────────────────────────────────────────────
//
// Page text structure (after split('\n').map(trim).filter(len > 0)):
//
//   ...nav chrome...
//   "Box Score Report"
//   "{ABBR} {@ or vs} {Opponent} - {Mon DD, YYYY} - {W|L|T} {score}-{score}"
//   "Rate This Breakdown"  "PrintExport"
//   "Period Stats"  "Team"  "1"  "2"  "3"  "4"  "Final"
//   "{ABBR}"  val  val  val  val  val     ← Aloha row
//   "{OPP}"   val  val  val  val  val     ← Opponent row
//   ... possession chart junk ...
//   "Team Stats"  "More Stat Tables"  "{ABBR}"  "{OPP}"
//   "{Category}"  "{aloha_val}"  "{opp_val}"   ← repeating triplets
//   ...
//   "Aloha Varsity Lacrosse's Player Stats"    ← section terminator

import type { BoxScoreCategory, PeriodScore } from '../types.js';

interface ParsedBoxScore {
  alohaAbbr: string;
  opponentAbbr: string;
  periodScores: PeriodScore[];
  categories: BoxScoreCategory[];
}

function parseBoxScorePage(text: string): ParsedBoxScore {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const { periodScores, alohaAbbr: periodAlohaAbbr, opponentAbbr: periodOppAbbr } =
    parsePeriodScores(lines);
  const { categories, alohaAbbr: statsAlohaAbbr, opponentAbbr: statsOppAbbr } =
    parseTeamStatCategories(lines);

  return {
    alohaAbbr:    statsAlohaAbbr || periodAlohaAbbr,
    opponentAbbr: statsOppAbbr   || periodOppAbbr,
    periodScores,
    categories,
  };
}

/** Parse period-by-period goal scores from the "Period Stats" table. */
function parsePeriodScores(lines: string[]): { periodScores: PeriodScore[]; alohaAbbr: string; opponentAbbr: string } {
  const periodStatsIdx = lines.findIndex(l => l === 'Period Stats');
  if (periodStatsIdx === -1) return { periodScores: [], alohaAbbr: '', opponentAbbr: '' };

  let i = periodStatsIdx + 1;
  if (lines[i] === 'Team') i++;

  // Collect period names: digits, "OT"/"OT1"/"OT2", "Final"
  const PERIOD_RE = /^(\d+|OT\d*|Final)$/i;
  const periods: string[] = [];
  while (i < lines.length && PERIOD_RE.test(lines[i])) {
    periods.push(lines[i++]);
  }
  if (periods.length === 0) return { periodScores: [], alohaAbbr: '', opponentAbbr: '' };

  // Aloha row
  const alohaAbbr = lines[i++] ?? '';
  const alohaScores = periods.map(() => parseInt(lines[i++] ?? '0', 10) || 0);

  // Opponent row
  const opponentAbbr = lines[i++] ?? '';
  const opponentScores = periods.map(() => parseInt(lines[i++] ?? '0', 10) || 0);

  const periodScores: PeriodScore[] = periods.map((period, idx) => ({
    period,
    aloha:    alohaScores[idx],
    opponent: opponentScores[idx],
  }));

  return { periodScores, alohaAbbr, opponentAbbr };
}

/** Parse the "Team Stats" comparison table as category/aloha/opponent triplets. */
function parseTeamStatCategories(lines: string[]): { categories: BoxScoreCategory[]; alohaAbbr: string; opponentAbbr: string } {
  const teamStatsIdx = lines.findIndex(l => l === 'Team Stats');
  if (teamStatsIdx === -1) return { categories: [], alohaAbbr: '', opponentAbbr: '' };

  let i = teamStatsIdx + 1;
  if (lines[i] === 'More Stat Tables') i++;

  const alohaAbbr    = lines[i++] ?? '';
  const opponentAbbr = lines[i++] ?? '';

  const categories: BoxScoreCategory[] = [];
  while (i + 2 < lines.length) {
    const category = lines[i];
    // Stop at player stats section or any other major section header
    if (category.includes("Player Stats")) break;
    categories.push({ category, aloha: lines[i + 1], opponent: lines[i + 2] });
    i += 3;
  }

  return { categories, alohaAbbr, opponentAbbr };
}

/** Extract game metadata from the box score header line.
 *  Handles: "AHS @ Century - Mar 19, 2026 - L 2-12"
 *           "AHS vs Oregon City - Mar 18, 2026 - W 6-5"
 */
interface GameMeta {
  alohaAbbr:    string;
  opponent:     string;
  homeAway:     'home' | 'away';
  date:         string;   // "Mar 19" (short form, consistent with ctx.gameEvents)
  result:       'W' | 'L' | 'T';
  teamScore:    number;
  opponentScore: number;
}

const HEADER_RE =
  /^(\w+)\s+(@|vs)\s+(.+?)\s+-\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*\d{4}\s+-\s+(W|L|T)\s+(\d+)-(\d+)$/i;

function extractGameMetadata(text: string): GameMeta | null {
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(HEADER_RE);
    if (!m) continue;
    return {
      alohaAbbr:    m[1],
      homeAway:     m[2] === '@' ? 'away' : 'home',
      opponent:     m[3].trim(),
      date:         `${m[4]} ${m[5]}`,   // e.g. "Mar 19"
      result:       m[6].toUpperCase() as 'W' | 'L' | 'T',
      teamScore:    parseInt(m[7], 10),
      opponentScore: parseInt(m[8], 10),
    };
  }
  return null;
}

// ── Game ID resolution helpers ────────────────────────────────────────────────
// Duplicated from gameStatsScraper.ts for isolation.
// TODO: extract to src/scrapers/gameResolver.ts once both scrapers are stable.

type GameResultLike = {
  date: string;
  opponent: string;
  homeAway: 'home' | 'away' | 'neutral' | 'unknown';
  teamScore: number;
  opponentScore: number;
  result: 'W' | 'L' | 'T';
};

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

/** Returns the 0-based newest-first index into allGames, or null if no match. */
function resolveGameIndex(identifier: string, allGames: GameResultLike[]): number | null {
  if (identifier === 'latest') return 0;

  if (/^\d+$/.test(identifier)) {
    return Math.min(parseInt(identifier, 10), allGames.length - 1);
  }

  const lower = identifier.toLowerCase();

  const byOpponent = allGames.findIndex(g => g.opponent.toLowerCase().includes(lower));
  if (byOpponent !== -1) {
    const allMatches = allGames.filter(g => g.opponent.toLowerCase().includes(lower));
    if (allMatches.length > 1) {
      console.error(
        `[box-score] WARNING: ${allMatches.length} games match "${identifier}" ` +
        `(${allMatches.map(g => g.date).join(', ')}) — returning most recent. ` +
        `Use a date or numeric index to select a specific game.`
      );
    }
    console.error(`[box-score] Matched "${identifier}" → vs ${allGames[byOpponent].opponent} on ${allGames[byOpponent].date}`);
    return byOpponent;
  }

  const byDate = allGames.findIndex(g => g.date.toLowerCase().includes(lower));
  if (byDate !== -1) {
    console.error(`[box-score] Matched "${identifier}" → ${allGames[byDate].date} vs ${allGames[byDate].opponent}`);
    return byDate;
  }

  // Fuzzy fallback
  const fuzzyThreshold = Math.max(2, Math.floor(lower.length * 0.25));
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i < allGames.length; i++) {
    const opponentLower = allGames[i].opponent.toLowerCase();
    const dist = Math.min(
      levenshtein(lower, opponentLower),
      ...opponentLower.split(/\s+/).map(word => levenshtein(lower, word))
    );
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  if (bestIdx !== -1 && bestDist <= fuzzyThreshold) {
    console.error(
      `[box-score] Fuzzy matched "${identifier}" → vs ${allGames[bestIdx].opponent} on ${allGames[bestIdx].date} (edit distance: ${bestDist})`
    );
    return bestIdx;
  }

  return null;
}

interface SeasonCtxLike {
  uniqueGameIds: string[];
  gameEvents: Array<{ uniqueGameId: string; date?: string }>;
}

function resolveUniqueGameId(
  ctx:         SeasonCtxLike,
  targetGame:  GameResultLike,
  targetIndex: number,
): string | undefined {
  const eventsWithDates = (ctx.gameEvents ?? []).filter(e => e.date);

  if (eventsWithDates.length > 0) {
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
        return d.getMonth() + 1 === targetParsed.month && d.getDate() === targetParsed.day;
      });
      if (match) {
        console.error(`[box-score] Date-matched uniqueGameId ${match.uniqueGameId} for ${targetGame.date}`);
        return match.uniqueGameId;
      }
      console.error(`[box-score] Date match failed for "${targetGame.date}" — falling back to index sort`);
    }
  }

  // Fallback: numeric-prefix sort (approximate)
  console.error('[box-score] Falling back to numeric-prefix index alignment');
  const idsNewestFirst = [...ctx.uniqueGameIds].sort((a, b) => {
    const nA = parseInt(a.split('-')[0], 10) || 0;
    const nB = parseInt(b.split('-')[0], 10) || 0;
    return nB - nA;
  });
  return idsNewestFirst[targetIndex];
}
