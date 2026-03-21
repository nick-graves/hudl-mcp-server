/**
 * Interactive CLI for testing Hudl MCP tools locally.
 * Run:  npm run cli
 *
 * Presents a menu, calls the same functions the MCP server uses,
 * and prints the results so you can inspect/debug without needing Claude.
 */

import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { loadSession, saveSession } from './cache/sessionCache.js';
import { ensureAuthenticated } from './auth/hudlAuth.js';
import { closeBrowser } from './browser/browserManager.js';
import { scrapeRoster } from './scrapers/rosterScraper.js';
import { scrapePlayerStats } from './scrapers/playerStatsScraper.js';
import { scrapeTeamStats } from './scrapers/teamStatsScraper.js';
import { scrapeGameResults } from './scrapers/gameResultsScraper.js';
import { scrapeGameStats }   from './scrapers/gameStatsScraper.js';
import { listAvailableSeasons } from './fetchers/reportsCsvFetcher.js';
import type { SessionState } from './types.js';

// ── Readline helpers ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function line(char = '─', length = 60): string {
  return char.repeat(length);
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(rows: Record<string, unknown>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log('  (no data)');
    return;
  }

  // Calculate column widths
  const widths: number[] = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))
  );

  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ');
  const divider = widths.map((w) => '─'.repeat(w)).join('  ');

  console.log(header);
  console.log(divider);
  rows.forEach((row) => {
    const line = columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join('  ');
    console.log(line);
  });
}

// ── Menu ─────────────────────────────────────────────────────────────────────

function printMenu(): void {
  console.log('\n' + line());
  console.log('  Hudl MCP Test CLI');
  console.log(line());
  console.log('  1.  Get Roster');
  console.log('  2.  Get Player Stats (all)');
  console.log('  3.  Get Player Stats (search by name)');
  console.log('  4.  Get Team Stats');
  console.log('  5.  Get Game Results');
  console.log('  6.  Get Game Results (limited)');
  console.log('  7.  [DISCOVERY] List Available Seasons');
  console.log('  8.  Get Single-Game Stats');
  console.log('  0.  Exit');
  console.log(line());
}

// ── Tool runners ─────────────────────────────────────────────────────────────

async function runRoster(session: SessionState | null, config: ReturnType<typeof loadConfig>) {
  console.log('\nFetching roster...');
  const { page, session: s } = await ensureAuthenticated(session, config);
  const roster = await scrapeRoster(page, s, config.teamId, (updated) => {
    saveSession(updated);
  });

  console.log(`\nRoster — ${roster.length} players\n`);
  printTable(roster as unknown as Record<string, unknown>[], ['number', 'name', 'position', 'grade']);
  return s;
}

async function runPlayerStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  nameFilter?: string,
  seasonId?: string
) {
  console.log('\nFetching player stats...');
  const { page, session: s } = await ensureAuthenticated(session, config);
  const players = await scrapePlayerStats(page, s, config.teamId, (updated) => {
    saveSession(updated);
  }, nameFilter, seasonId);

  const label = nameFilter ? `Player Stats — filter: "${nameFilter}"` : 'Player Stats — All Players';
  console.log(`\n${label} (sorted by points)\n`);

  // Offense
  console.log('── Offense ──');
  printTable(players as unknown as Record<string, unknown>[], [
    'number', 'name', 'gamesPlayed', 'goals', 'assists', 'points', 'shots', 'shotsOnTarget', 'shotPct', 'groundBalls', 'extraManGoals',
  ]);

  // Face-offs (only show players who took face-offs)
  const foPlayers = players.filter((p) => p.faceoffs > 0);
  if (foPlayers.length > 0) {
    console.log('\n── Face-Offs ──');
    printTable(foPlayers as unknown as Record<string, unknown>[], [
      'number', 'name', 'faceoffs', 'faceoffWins', 'faceoffLosses', 'faceoffPct',
    ]);
  }

  // Turnovers
  console.log('\n── Turnovers ──');
  printTable(players as unknown as Record<string, unknown>[], [
    'number', 'name', 'turnovers', 'forcedTurnovers', 'unforcedTurnovers', 'causedTurnovers',
  ]);

  // Goalies (players with saves or goals allowed)
  const goalies = players.filter((p) => p.saves > 0 || p.goalsAllowed > 0);
  if (goalies.length > 0) {
    console.log('\n── Goalies ──');
    printTable(goalies as unknown as Record<string, unknown>[], [
      'number', 'name', 'saves', 'goalsAllowed', 'savePct',
    ]);
  }

  // Penalties
  const penaltyPlayers = players.filter((p) => p.penalties > 0);
  if (penaltyPlayers.length > 0) {
    console.log('\n── Penalties ──');
    printTable(penaltyPlayers as unknown as Record<string, unknown>[], [
      'number', 'name', 'penalties',
    ]);
  }
  return s;
}

async function runTeamStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  seasonId?: string
) {
  console.log('\nFetching team stats...');
  const { page, session: s } = await ensureAuthenticated(session, config);
  const stats = await scrapeTeamStats(page, s, config.teamId, (updated) => {
    saveSession(updated);
  }, seasonId);

  console.log('\nTeam Stats\n');
  console.log(`  Season:          ${stats.season}`);
  console.log(`  Record:          ${stats.wins}W - ${stats.losses}L - ${stats.ties}T`);
  console.log(`  Games Played:    ${stats.games}`);
  console.log(`  Win %:           ${stats.winPercentage}%`);
  console.log(`  Goals For:       ${stats.goalsFor}`);
  console.log(`  Goals Against:   ${stats.goalsAgainst}`);
  if (stats.raw?.['shotPercentage']) {
    console.log(`  Shot %:          ${stats.raw['shotPercentage']}%`);
  }
  console.log('\nRaw CSV data:');
  printJson(stats.raw);
  return s;
}

async function runGameResults(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  limit?: number,
  seasonId?: string
) {
  console.log('\nFetching game results...');
  const { page, session: s } = await ensureAuthenticated(session, config);
  const games = await scrapeGameResults(page, s, config.teamId, (updated) => {
    saveSession(updated);
  }, limit, seasonId);

  const label = limit ? `Last ${limit} Games` : 'All Game Results';
  console.log(`\n${label}\n`);
  printTable(games as unknown as Record<string, unknown>[], [
    'date', 'homeAway', 'opponent', 'result', 'teamScore', 'opponentScore',
  ]);
  return s;
}

async function runDiscoverSeasons(session: SessionState | null, config: ReturnType<typeof loadConfig>) {
  console.log('\nFetching available seasons from Hudl...');
  const { page, session: s } = await ensureAuthenticated(session, config);
  const seasons = await listAvailableSeasons(page, config.teamId);

  console.log('\n' + line('═'));
  console.log('  AVAILABLE SEASONS');
  console.log(line('═'));

  if (seasons.length === 0) {
    console.log('\n  (no seasons found)');
  } else {
    console.log(`\n  ${seasons.length} seasons found (newest first):\n`);
    printTable(seasons as unknown as Record<string, unknown>[], ['seasonId', 'seasonYear', 'label']);
    console.log('\n  Tip: pass the seasonId to get_player_stats, get_team_stats, or get_game_results');
    console.log('  Example: get_player_stats({ season: "1128302" })  → 2019-2020 Season');
  }

  console.log('\n' + line('═'));
  return s;
}

async function runGameStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  gameIdentifier: string,
  seasonId?: string,
) {
  console.log(`\nFetching single-game stats (game: "${gameIdentifier}")...`);
  const { page, session: s } = await ensureAuthenticated(session, config);
  const result = await scrapeGameStats(page, s, config.teamId, (updated) => {
    saveSession(updated);
  }, gameIdentifier, seasonId);

  if (!result) {
    console.log('\n  (no data returned — check season ID and game identifier)');
    return s;
  }

  const homeAway = result.homeAway === 'home' ? 'vs' : '@';
  console.log(`\nSingle-Game Stats — ${result.date} ${homeAway} ${result.opponent}`);
  console.log(`  Result:   ${result.result}  ${result.teamScore}–${result.opponentScore}`);
  console.log(`  Season:   ${result.seasonId}`);
  console.log(`  Game ID:  ${result.uniqueGameId}`);
  console.log(`  Players:  ${result.players.length}\n`);

  // Offense
  const scorers = result.players.filter(p => p.goals > 0 || p.assists > 0);
  console.log('── Scoring ──');
  printTable(
    (scorers.length > 0 ? scorers : result.players) as unknown as Record<string, unknown>[],
    ['number', 'name', 'goals', 'assists', 'points', 'shots', 'shotsOnTarget', 'shotPct'],
  );

  // Face-offs
  const foPlayers = result.players.filter(p => p.faceoffs > 0);
  if (foPlayers.length > 0) {
    console.log('\n── Face-Offs ──');
    printTable(foPlayers as unknown as Record<string, unknown>[], [
      'number', 'name', 'faceoffs', 'faceoffWins', 'faceoffLosses', 'faceoffPct',
    ]);
  }

  // Goalies
  const goalies = result.players.filter(p => p.saves > 0 || p.goalsAllowed > 0);
  if (goalies.length > 0) {
    console.log('\n── Goalies ──');
    printTable(goalies as unknown as Record<string, unknown>[], [
      'number', 'name', 'saves', 'goalsAllowed', 'savePct',
    ]);
  }

  return s;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig();
  let session: SessionState | null = loadSession();

  console.log('\nHudl MCP Test CLI');
  console.log(`Team ID: ${config.teamId}`);
  console.log('Note: first call will open a browser and log in (~15s)');

  while (true) {
    printMenu();
    const choice = (await ask('  Enter choice: ')).trim();

    try {
      switch (choice) {
        case '1':
          session = await runRoster(session, config);
          break;

        case '2': {
          const s2 = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await runPlayerStats(session, config, undefined, s2 || undefined);
          break;
        }

        case '3': {
          const name = await ask('  Enter player name to search: ');
          const s3 = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await runPlayerStats(session, config, name.trim(), s3 || undefined);
          break;
        }

        case '4': {
          const s4 = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await runTeamStats(session, config, s4 || undefined);
          break;
        }

        case '5': {
          const s5 = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await runGameResults(session, config, undefined, s5 || undefined);
          break;
        }

        case '6': {
          const s6 = (await ask('  Season ID (leave blank for current): ')).trim();
          const n = await ask('  How many games? ');
          const limit = parseInt(n.trim(), 10);
          session = await runGameResults(session, config, isNaN(limit) ? 5 : limit, s6 || undefined);
          break;
        }

        case '7':
          session = await runDiscoverSeasons(session, config);
          break;

        case '8': {
          const s8 = (await ask('  Season ID (leave blank for current): ')).trim();
          const gi = (await ask('  Game ("latest", opponent name, date, or 0-based index): ')).trim();
          session = await runGameStats(session, config, gi || 'latest', s8 || undefined);
          break;
        }

        case '0':
          console.log('\nClosing browser and exiting...');
          await closeBrowser();
          rl.close();
          process.exit(0);
          break;

        default:
          console.log('  Invalid choice. Please enter a number from the menu.');
      }
    } catch (err) {
      console.error('\n[ERROR]', err instanceof Error ? err.message : err);
      console.error('You can try again — the session will be reused if still valid.\n');
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
