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
  console.error('[team-stats] Page text preview:\n' + text.split('\n').slice(0, 120).join('\n'));

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
  // Case-insensitive section finder
  const findSection = (names: string[]) =>
    lines.findIndex((l) => names.some(n => l.toLowerCase() === n.toLowerCase()));

  const offenseIdx = findSection(['Offense']);
  if (offenseIdx === -1) {
    return emptyStats(seasonId, record);
  }

  // ── Offense section ───────────────────────────────────────────────────────
  // Header line: "G\tA\tP\tS\tSOT\tS%\tGB\tEMOG" (tab-separated)
  // Values are one per line after the header, ordered by column index.
  const offHeaderLine = lines[offenseIdx + 1] ?? '';
  const offHeaders = offHeaderLine.split('\t').map((h) => h.trim());
  const offValues  = lines.slice(offenseIdx + 2);

  const offIdx = (name: string) => offHeaders.findIndex((h) => h === name);
  const offVal = (i: number)    => (i >= 0 ? offValues[i] ?? '' : '');

  const goalsFor      = parseInt(offVal(offIdx('G')),    10) || 0;
  const assists       = parseInt(offVal(offIdx('A')),    10) || 0;
  const shots         = parseInt(offVal(offIdx('S')),    10) || 0;
  const shotsOnTarget = parseInt(offVal(offIdx('SOT')),  10) || 0;
  const groundBalls   = parseInt(offVal(offIdx('GB')),   10) || 0;
  const extraManGoals = parseInt(offVal(offIdx('EMOG')), 10) || 0;
  const shotPctRaw    = offVal(offHeaders.findIndex((h) => h.includes('%') && h !== 'FO%'));
  const shotPctNum    = parseFloat(shotPctRaw) || 0;
  const shotPct       = shotPctRaw ? `${shotPctNum}%` : '';

  // ── Defense section ───────────────────────────────────────────────────────
  const defenseIdx = findSection(['Defense']);
  let goalsAgainst = 0, saves = 0, savePct = '';
  if (defenseIdx !== -1) {
    const defHeaders = (lines[defenseIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const defValues  = lines.slice(defenseIdx + 2);
    const dIdx = (name: string) => defHeaders.findIndex((h) => h === name);
    const dVal = (i: number)    => (i >= 0 ? defValues[i] ?? '' : '');

    const gaIdx  = dIdx('GA');
    const svIdx  = dIdx('SV');
    const svPctI = defHeaders.findIndex((h) => h.includes('%'));

    goalsAgainst = gaIdx  >= 0 ? parseInt(dVal(gaIdx),  10) || 0 : 0;
    saves        = svIdx  >= 0 ? parseInt(dVal(svIdx),  10) || 0 : 0;
    savePct      = svPctI >= 0 ? dVal(svPctI) : '';
  }

  // ── Face-offs section ─────────────────────────────────────────────────────
  let faceoffWins = 0, faceoffLosses = 0, faceoffTotal = 0, faceoffPct = '';
  const foSectionIdx = findSection(['Face-offs', 'Faceoffs', 'Face Offs', 'Faceoff']);
  if (foSectionIdx !== -1) {
    const foHeaders = (lines[foSectionIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const foValues  = lines.slice(foSectionIdx + 2);
    const fIdx = (name: string) => foHeaders.findIndex((h) => h === name);
    const fVal = (i: number)    => (i >= 0 ? foValues[i] ?? '' : '');

    // Hudl column names vary — try common variants
    const wI  = fIdx('W')  >= 0 ? fIdx('W')  : foHeaders.findIndex(h => /^FO.?W/i.test(h));
    const lI  = fIdx('L')  >= 0 ? fIdx('L')  : foHeaders.findIndex(h => /^FO.?L/i.test(h));
    const pI  = foHeaders.findIndex(h => h.includes('%'));

    faceoffWins   = wI >= 0 ? parseInt(fVal(wI), 10) || 0 : 0;
    faceoffLosses = lI >= 0 ? parseInt(fVal(lI), 10) || 0 : 0;
    faceoffTotal  = faceoffWins + faceoffLosses;
    faceoffPct    = pI >= 0 ? fVal(pI) : '';
  }

  // ── Turnovers section ─────────────────────────────────────────────────────
  let turnovers = 0, causedTurnovers = 0;
  const toSectionIdx = findSection(['Turnovers', 'Turnover']);
  if (toSectionIdx !== -1) {
    const toHeaders = (lines[toSectionIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const toValues  = lines.slice(toSectionIdx + 2);
    const tIdx = (name: string) => toHeaders.findIndex((h) => h === name);
    const tVal = (i: number)    => (i >= 0 ? toValues[i] ?? '' : '');

    const tI  = tIdx('TO');
    const ctI = tIdx('CT') >= 0 ? tIdx('CT') : tIdx('CTO');

    turnovers       = tI  >= 0 ? parseInt(tVal(tI),  10) || 0 : 0;
    causedTurnovers = ctI >= 0 ? parseInt(tVal(ctI), 10) || 0 : 0;
  }

  // ── Clears section ────────────────────────────────────────────────────────
  let clears = 0, clearAttempts = 0, clearPct = '';
  const clrSectionIdx = findSection(['Clears', 'Clear']);
  if (clrSectionIdx !== -1) {
    const clrHeaders = (lines[clrSectionIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const clrValues  = lines.slice(clrSectionIdx + 2);
    const cIdx = (name: string) => clrHeaders.findIndex((h) => h === name);
    const cVal = (i: number)    => (i >= 0 ? clrValues[i] ?? '' : '');

    const clI  = cIdx('CLR') >= 0 ? cIdx('CLR') : cIdx('C');
    const caI  = cIdx('CLRA') >= 0 ? cIdx('CLRA') : cIdx('CA');
    const cpI  = clrHeaders.findIndex(h => h.includes('%'));

    clears        = clI >= 0 ? parseInt(cVal(clI), 10) || 0 : 0;
    clearAttempts = caI >= 0 ? parseInt(cVal(caI), 10) || 0 : 0;
    clearPct      = cpI >= 0 ? cVal(cpI) : '';
  }

  // ── Rides section ─────────────────────────────────────────────────────────
  let rides = 0, rideAttempts = 0, ridePct = '';
  const rideSectionIdx = findSection(['Rides', 'Ride']);
  if (rideSectionIdx !== -1) {
    const rideHeaders = (lines[rideSectionIdx + 1] ?? '').split('\t').map((h) => h.trim());
    const rideValues  = lines.slice(rideSectionIdx + 2);
    const rIdx = (name: string) => rideHeaders.findIndex((h) => h === name);
    const rVal = (i: number)    => (i >= 0 ? rideValues[i] ?? '' : '');

    const rI  = rIdx('RDE') >= 0 ? rIdx('RDE') : rIdx('R');
    const raI = rIdx('RDEA') >= 0 ? rIdx('RDEA') : rIdx('RA');
    const rpI = rideHeaders.findIndex(h => h.includes('%'));

    rides        = rI  >= 0 ? parseInt(rVal(rI),  10) || 0 : 0;
    rideAttempts = raI >= 0 ? parseInt(rVal(raI), 10) || 0 : 0;
    ridePct      = rpI >= 0 ? rVal(rpI) : '';
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
    winPercentage:  games > 0 ? Math.round((wins / games) * 1000) / 10 : 0,
    shots,
    shotsOnTarget,
    shotPercentage: shotPct || undefined,
    groundBalls:    groundBalls   || undefined,
    extraManGoals:  extraManGoals || undefined,
    saves:          saves         || undefined,
    savePct:        savePct       || undefined,
    faceoffWins:    faceoffWins   || undefined,
    faceoffLosses:  faceoffLosses || undefined,
    faceoffTotal:   faceoffTotal  || undefined,
    faceoffPct:     faceoffPct    || undefined,
    turnovers:      turnovers     || undefined,
    causedTurnovers: causedTurnovers || undefined,
    clears:         clears        || undefined,
    clearAttempts:  clearAttempts || undefined,
    clearPct:       clearPct      || undefined,
    assists:        assists        || undefined,
    rides:          rides         || undefined,
    rideAttempts:   rideAttempts  || undefined,
    ridePct:        ridePct       || undefined,
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
