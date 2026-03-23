import type { Page } from 'playwright';
import type { TeamStats, SessionState } from '../types.js';
import { getSeasonContext } from '../fetchers/reportsCsvFetcher.js';

export async function scrapeTeamStats(
  page: Page,
  _session: SessionState,
  teamId: string,
  _onSessionUpdate: (s: SessionState) => void,
  seasonId?: string
): Promise<TeamStats> {
  const ctx = await getSeasonContext(page, teamId, seasonId);
  const gameParam = ctx.uniqueGameIds.join(',');
  const periods = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';

  const qs = [
    `A%5B%5D=ALL`,
    `GRP=OVERALL`,
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
  console.error(`[team-stats] Navigating to: ${url}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for stats to render
  await page.waitForFunction(
    () => document.body.innerText.includes('Offense'),
    { timeout: 20000 }
  );
  await page.waitForTimeout(1000);

  const text = await page.locator('body').innerText();
  console.error('[team-stats] Page text preview:\n' + text.split('\n').slice(0, 60).join('\n'));

  // Get win/loss record from the season-scoped GRP=GAME reports page
  const record = await fetchWinLossFromReportsPage(page, teamId, ctx.seasonId, ctx.uniqueGameIds);

  return parseTeamStatsFromText(text, ctx.seasonId, record);
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseTeamStatsFromText(
  text: string,
  seasonId: string,
  record: { wins: number; losses: number; ties: number }
): TeamStats {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const offenseIdx = lines.findIndex((l) => l === 'Offense');
  if (offenseIdx === -1) {
    return emptyStats(seasonId, record);
  }

  // Header line: "G\tA\tP\tS\tSOT\tS%\tGB\tEMOG" (tab-separated)
  const headerLine = lines[offenseIdx + 1] ?? '';
  const headers = headerLine.split('\t').map((h) => h.trim());

  // Values — one per line starting after the header
  // For OVERALL grouping there are two rows: Overall + Period breakdown
  // Just grab first numCols values (Overall row)
  const valueLines = lines.slice(offenseIdx + 2);
  const numCols = headers.length;

  const idx = (name: string) => headers.findIndex((h) => h === name);
  const val = (i: number) => (i >= 0 ? valueLines[i] ?? '' : '');

  const goalsFor = parseInt(val(idx('G')), 10) || 0;
  const assists = parseInt(val(idx('A')), 10) || 0;
  const shots = parseInt(val(idx('S')), 10) || 0;
  const shotsOnTarget = parseInt(val(idx('SOT')), 10) || 0;
  const shotPctStr = val(headers.findIndex((h) => h.includes('%')));
  const shotPct = parseFloat(shotPctStr) || 0;

  // Goals against — look in Defense section
  const defenseIdx = lines.findIndex((l) => l === 'Defense');
  let goalsAgainst = 0;
  if (defenseIdx !== -1) {
    const defHeaders = (lines[defenseIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const gaIdx = defHeaders.findIndex((h) => h === 'GA');
    if (gaIdx >= 0) {
      const defValues = lines.slice(defenseIdx + 2);
      goalsAgainst = parseInt(defValues[gaIdx] ?? '0', 10) || 0;
    }
  }

  const { wins, losses, ties } = record;
  const games = wins + losses + ties;

  return {
    season: seasonId,
    wins,
    losses,
    ties,
    games,
    goalsFor,
    goalsAgainst,
    winPercentage: games > 0 ? Math.round((wins / games) * 1000) / 10 : 0,
    raw: { assists, shots, shotsOnTarget, shotPercentage: `${shotPct}%` },
  };
}

function emptyStats(
  seasonId: string,
  record: { wins: number; losses: number; ties: number }
): TeamStats {
  const { wins, losses, ties } = record;
  const games = wins + losses + ties;
  return {
    season: seasonId,
    wins,
    losses,
    ties,
    games,
    goalsFor: 0,
    goalsAgainst: 0,
    winPercentage: games > 0 ? Math.round((wins / games) * 1000) / 10 : 0,
  };
}

// ── Win/loss record from season-scoped GRP=GAME reports page ─────────────────
//
// Uses the same reports page + parsing approach as gameResultsScraper so the
// record is always tied to the correct season and game list.

async function fetchWinLossFromReportsPage(
  page: Page,
  teamId: string,
  seasonId: string,
  uniqueGameIds: string[]
): Promise<{ wins: number; losses: number; ties: number }> {
  try {
    const gameParam = uniqueGameIds.join(',');
    const periods = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';

    const qs = [
      `A%5B%5D=ALL`,
      `GRP=GAME`,
      gameParam ? `G%5B%5D=${encodeURIComponent(gameParam)}` : '',
      `P%5B%5D=${encodeURIComponent(periods)}`,
      `Q=all-season`,
      `S=${seasonId}`,
      `SD=${teamId}`,
      `SHT%5B%5D=ALL`,
      `SST=GOALPERCENTAGE`,
      `ST=0-Goals`,
      `STYPE=TOTALS`,
      `T=${teamId}`,
      `Z=ZONE`,
    ].filter(Boolean).join('&');

    const url = `https://www.hudl.com/reports/teams/${teamId}/stats?${qs}`;
    console.error(`[team-stats] Fetching W/L record from: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const text = await page.locator('body').innerText();
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // Same result-line pattern as gameResultsScraper: "W 6-5", "L 9-11", "T 4-4"
    const RESULT_RE = /^(W|L|T)\s+\d+-\d+$/i;

    let wins = 0, losses = 0, ties = 0;
    for (const line of lines) {
      const m = line.match(RESULT_RE);
      if (!m) continue;
      const outcome = m[1].toUpperCase();
      if (outcome === 'W') wins++;
      else if (outcome === 'L') losses++;
      else ties++;
    }

    console.error(`[team-stats] W/L record: ${wins}W ${losses}L ${ties}T`);
    return { wins, losses, ties };
  } catch (err) {
    console.error('[team-stats] fetchWinLossFromReportsPage failed:', err);
    return { wins: 0, losses: 0, ties: 0 };
  }
}
