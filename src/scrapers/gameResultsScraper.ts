import type { Page } from 'playwright';
import type { GameResult, SessionState } from '../types.js';
import { getSeasonContext } from '../fetchers/reportsCsvFetcher.js';

export async function scrapeGameResults(
  page: Page,
  _session: SessionState,
  teamId: string,
  _onSessionUpdate: (s: SessionState) => void,
  limit?: number,
  seasonId?: string
): Promise<GameResult[]> {
  const ctx = await getSeasonContext(page, teamId, seasonId);
  const gameParam = ctx.uniqueGameIds.join(',');
  const periods = 'WHOLEGAME,FIRSTHALF,SECONDHALF,Q1,Q2,Q3,Q4,OVERTIME';

  const qs = [
    `A%5B%5D=ALL`,
    `GRP=GAME`,
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
  console.error(`[game-results] Navigating to: ${url}`);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const text = await page.locator('body').innerText();
  console.error('[game-results] Page text (first 80 lines):\n' + text.split('\n').slice(0, 80).join('\n'));

  const results = parseGameResultsFromReportText(text);
  console.error(`[game-results] Parsed ${results.length} games`);

  return limit ? results.slice(0, limit) : results;
}

function parseGameResultsFromReportText(text: string): GameResult[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // The GRP=GAME page renders a games table with this structure:
  //   Games          ← section header (appears twice; we want the one followed by "Date")
  //   Date           ← column headers
  //   Opponent
  //   Result
  //   May 18         ← game entry line 1: date  (Month DD)
  //   @ Beaverton    ← game entry line 2: home/away indicator + opponent
  //   L 9-11         ← game entry line 3: result (W|L|T score-score)
  //   May 12
  //   vs Mountainside
  //   L 4-12
  //   ...

  // Find the games table — locate "Games" immediately followed by "Date"
  let dataStart = -1;
  for (let j = 0; j < lines.length - 1; j++) {
    if (lines[j] === 'Games' && lines[j + 1] === 'Date') {
      dataStart = j + 2; // skip "Games" and "Date"
      break;
    }
  }
  if (dataStart === -1) {
    console.error('[game-results] Could not locate Games table in page text');
    return [];
  }

  // Skip the "Opponent" and "Result" column sub-headers
  while (dataStart < lines.length && ['Opponent', 'Result'].includes(lines[dataStart])) {
    dataStart++;
  }

  // DATE: "May 18", "Apr 3", "March 19", etc.
  const DATE_RE    = /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}$/i;
  // OPPONENT: "@ Beaverton" or "vs Mountainside"
  const OPP_RE     = /^(@|vs)\s+.+/i;
  // RESULT: "W 6-5", "L 9-11", "T 4-4"
  const RESULT_RE  = /^(W|L|T)\s+(\d+)-(\d+)$/i;

  const results: GameResult[] = [];
  let i = dataStart;

  while (i < lines.length - 2) {
    const dateLine     = lines[i];
    const opponentLine = lines[i + 1];
    const resultLine   = lines[i + 2];

    if (!DATE_RE.test(dateLine) || !OPP_RE.test(opponentLine) || !RESULT_RE.test(resultLine)) {
      i++;
      continue;
    }

    const resMatch     = resultLine.match(RESULT_RE)!;
    const outcome      = resMatch[1].toUpperCase() as 'W' | 'L' | 'T';
    const teamScore    = parseInt(resMatch[2], 10);
    const oppScore     = parseInt(resMatch[3], 10);
    const isHome       = opponentLine.trim().toLowerCase().startsWith('vs');
    const opponent     = opponentLine.replace(/^(@|vs)\s+/i, '').trim();

    results.push({
      gameId:        String(results.length),
      date:          dateLine,
      opponent,
      homeAway:      isHome ? 'home' : 'away',
      teamScore,
      opponentScore: oppScore,
      result:        outcome,
    });

    i += 3;
  }

  return results;
}
