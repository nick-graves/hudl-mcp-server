import type { Page } from 'playwright';
import type { GameResult, SessionState } from '../types.js';

export async function scrapeGameResults(
  page: Page,
  _session: SessionState,
  teamId: string,
  _onSessionUpdate: (s: SessionState) => void,
  limit?: number
): Promise<GameResult[]> {
  // Navigate to the public team page — its Games tab has scores + results
  await page.goto(`https://www.hudl.com/team/v2/${teamId}`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });
  await page.waitForTimeout(2000);

  const results = await parseGameResultsFromPage(page);
  return limit ? results.slice(0, limit) : results;
}

async function parseGameResultsFromPage(page: Page): Promise<GameResult[]> {
  const text = await page.locator('body').innerText();

  // The team page timeline shows entries in this repeating pattern:
  //   @ Opponent Name\n  DD Month\n  Win/Loss\n  A ‑ B
  // or
  //   vs Opponent Name\n  DD Month\n  Win/Loss\n  A ‑ B
  //
  // The dash in the score is U+2011 (non-breaking hyphen) or similar — match broadly.
  const gameRegex =
    /(@|vs)\s+(.+?)\n\s*(\d{1,2}\s+\w+)\s*\n\s*(Win|Loss|Tie)\s*\n\s*(\d+)\s*[\u2010-\u2015\-]\s*(\d+)/gi;

  const games: GameResult[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = gameRegex.exec(text)) !== null) {
    const [, prefix, opponent, date, result, scoreA, scoreB] = match;
    const isHome = prefix.trim().toLowerCase() === 'vs';
    const teamScore = parseInt(scoreA, 10);
    const opponentScore = parseInt(scoreB, 10);
    const outcome: 'W' | 'L' | 'T' =
      result.toLowerCase() === 'win' ? 'W' : result.toLowerCase() === 'loss' ? 'L' : 'T';

    games.push({
      gameId: String(idx++),
      date: date.trim(),
      opponent: opponent.trim(),
      homeAway: isHome ? 'home' : 'away',
      teamScore,
      opponentScore,
      result: outcome,
    });
  }

  return games;
}
