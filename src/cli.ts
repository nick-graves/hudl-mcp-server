/**
 * Interactive CLI for testing Hudl MCP tools locally.
 * Run:  npm run cli
 *
 * Mirrors the exact tool calls the MCP server makes so you see precisely
 * what the LLM receives. Output is split into two clearly-labelled sections:
 *
 *   [DEBUG]  — scraper/browser progress messages
 *   [LLM]    — the exact JSON payload the MCP server would return to the LLM
 */

import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { loadSession, saveSession } from './cache/sessionCache.js';
import { ensureAuthenticated } from './auth/hudlAuth.js';
import { closeBrowser } from './browser/browserManager.js';
import { scrapePlayerStats } from './scrapers/playerStatsScraper.js';
import { scrapeTeamStats } from './scrapers/teamStatsScraper.js';
import { scrapeGameResults } from './scrapers/gameResultsScraper.js';
import { scrapeGameStats } from './scrapers/gameStatsScraper.js';
import { listAvailableSeasons } from './fetchers/reportsCsvFetcher.js';
import type { SessionState } from './types.js';

// ── Readline helpers ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── Display helpers ───────────────────────────────────────────────────────────

const W = 72;

function hr(char = '─', width = W): string {
  return char.repeat(width);
}

function debugStart(toolName: string, params: Record<string, unknown> = {}): void {
  console.log('\n' + hr('═'));
  const paramStr = Object.keys(params).length
    ? '  params: ' + JSON.stringify(params)
    : '  params: (none)';
  console.log(`  TOOL: ${toolName}`);
  console.log(paramStr);
  console.log(hr('═'));
  console.log('  [DEBUG OUTPUT]');
  console.log(hr());
}

function llmStart(): void {
  console.log('\n' + hr('─'));
  console.log('  ▼  LLM RESPONSE  (exactly what the model receives)  ▼');
  console.log(hr('─'));
}

function llmEnd(): void {
  console.log(hr('─'));
  console.log('  ▲  END LLM RESPONSE  ▲');
  console.log(hr('─'));
}

/** Print the LLM payload exactly as the MCP server formats it. */
function printLlmPayload(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  llmStart();
  console.log(json);
  llmEnd();
  return json;
}

// ── Validation ────────────────────────────────────────────────────────────────

type ValidationResult = { pass: boolean; warnings: string[]; errors: string[] };

function validate(label: string, result: ValidationResult): void {
  const { warnings, errors } = result;
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`\n  ✔  VALIDATION PASSED — ${label}`);
    return;
  }
  console.log(`\n  VALIDATION — ${label}`);
  errors.forEach((e) => console.log(`    ✖  ERROR:   ${e}`));
  warnings.forEach((w) => console.log(`    ⚠  WARNING: ${w}`));
}

function validatePlayerStats(players: unknown[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (players.length === 0) errors.push('Player stats array is empty');
  const requiredKeys = ['name', 'goals', 'assists', 'gamesPlayed'];
  const sample = players[0] as Record<string, unknown> | undefined;
  if (sample) {
    requiredKeys.forEach((k) => {
      if (sample[k] === undefined || sample[k] === null)
        warnings.push(`Field "${k}" missing on first player`);
    });
    // Sanity: gamesPlayed should be a positive number
    const gp = Number(sample['gamesPlayed']);
    if (isNaN(gp) || gp <= 0) warnings.push(`gamesPlayed is not a positive number on first player (got ${sample['gamesPlayed']})`);
  }
  const nullNames = (players as Record<string, unknown>[]).filter((p) => !p['name']);
  if (nullNames.length > 0) errors.push(`${nullNames.length} player(s) have no name`);
  return { pass: errors.length === 0, warnings, errors };
}

function validateTeamStats(stats: Record<string, unknown>): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const requiredKeys = ['season', 'wins', 'losses', 'games', 'goalsFor', 'goalsAgainst', 'winPercentage'];
  requiredKeys.forEach((k) => {
    if (stats[k] === undefined || stats[k] === null)
      errors.push(`Field "${k}" is missing`);
  });
  const wins = Number(stats['wins']);
  const losses = Number(stats['losses']);
  const games = Number(stats['games']);
  if (!isNaN(wins) && !isNaN(losses) && !isNaN(games)) {
    if (wins + losses > games)
      errors.push(`wins(${wins}) + losses(${losses}) > games(${games}) — inconsistent record`);
  }
  if (!stats['season'] || stats['season'] === '') warnings.push('season field is blank');
  return { pass: errors.length === 0, warnings, errors };
}

function validateGameResults(games: unknown[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (games.length === 0) errors.push('Game results array is empty');
  const requiredKeys = ['date', 'opponent', 'result', 'teamScore', 'opponentScore'];
  let malformed = 0;
  (games as Record<string, unknown>[]).forEach((g, i) => {
    requiredKeys.forEach((k) => {
      if (g[k] === undefined || g[k] === null || g[k] === '')
        malformed++;
    });
    if (!['W', 'L', 'T'].includes(String(g['result'])))
      warnings.push(`Game ${i}: result "${g['result']}" is not W/L/T`);
  });
  if (malformed > 0) warnings.push(`${malformed} missing field(s) across all games`);
  return { pass: errors.length === 0, warnings, errors };
}

function validateSeasons(seasons: unknown[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (seasons.length === 0) errors.push('No seasons returned');
  const requiredKeys = ['seasonId', 'seasonYear', 'label'];
  const sample = seasons[0] as Record<string, unknown> | undefined;
  if (sample) {
    requiredKeys.forEach((k) => {
      if (sample[k] === undefined || sample[k] === null || sample[k] === '')
        warnings.push(`Field "${k}" missing on first season`);
    });
  }
  return { pass: errors.length === 0, warnings, errors };
}

function validateGameStats(result: Record<string, unknown> | null): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!result) {
    errors.push('Result is null — game not found');
    return { pass: false, warnings, errors };
  }
  const requiredKeys = ['date', 'opponent', 'result', 'teamScore', 'opponentScore', 'players'];
  requiredKeys.forEach((k) => {
    if (result[k] === undefined || result[k] === null)
      errors.push(`Field "${k}" is missing`);
  });
  const players = result['players'];
  if (!Array.isArray(players)) {
    errors.push('"players" is not an array');
  } else {
    if (players.length === 0) errors.push('"players" array is empty');
    else {
      const sample = players[0] as Record<string, unknown>;
      ['name', 'goals', 'assists'].forEach((k) => {
        if (sample[k] === undefined || sample[k] === null)
          warnings.push(`Field "${k}" missing on first player`);
      });
    }
  }
  return { pass: errors.length === 0, warnings, errors };
}

// ── Tool runners (mirror server.ts handlers exactly) ─────────────────────────

async function toolGetPlayerStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  playerName?: string,
  season?: string
): Promise<SessionState> {
  const params: Record<string, unknown> = {};
  if (playerName) params['playerName'] = playerName;
  if (season) params['season'] = season;
  debugStart('get_player_stats', params);

  const { page, session: s } = await ensureAuthenticated(session, config);
  const players = await scrapePlayerStats(page, s, config.teamId, saveSession, playerName, season);

  printLlmPayload(players);
  validate('get_player_stats', validatePlayerStats(players));

  return s;
}

async function toolGetTeamStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  season?: string
): Promise<SessionState> {
  const params: Record<string, unknown> = {};
  if (season) params['season'] = season;
  debugStart('get_team_stats', params);

  const { page, session: s } = await ensureAuthenticated(session, config);
  const stats = await scrapeTeamStats(page, s, config.teamId, saveSession, season);

  printLlmPayload(stats);
  validate('get_team_stats', validateTeamStats(stats as unknown as Record<string, unknown>));

  return s;
}

async function toolGetGameResults(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  limit?: number,
  season?: string
): Promise<SessionState> {
  const params: Record<string, unknown> = {};
  if (limit) params['limit'] = limit;
  if (season) params['season'] = season;
  debugStart('get_game_results', params);

  const { page, session: s } = await ensureAuthenticated(session, config);
  const games = await scrapeGameResults(page, s, config.teamId, saveSession, limit, season);

  printLlmPayload(games);
  validate('get_game_results', validateGameResults(games));

  return s;
}

async function toolListSeasons(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>
): Promise<SessionState> {
  debugStart('list_seasons');

  const { page, session: s } = await ensureAuthenticated(session, config);
  const seasons = await listAvailableSeasons(page, config.teamId);

  printLlmPayload(seasons);
  validate('list_seasons', validateSeasons(seasons));

  return s;
}

async function toolGetGameStats(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>,
  game: string,
  season?: string
): Promise<SessionState> {
  const params: Record<string, unknown> = { game };
  if (season) params['season'] = season;
  debugStart('get_game_stats', params);

  const { page, session: s } = await ensureAuthenticated(session, config);
  const result = await scrapeGameStats(page, s, config.teamId, saveSession, game, season);

  // Server returns this exact text when null:
  const payload = result ?? 'No data found for the specified game.';
  printLlmPayload(payload);
  validate('get_game_stats', validateGameStats(result as Record<string, unknown> | null));

  return s;
}

// ── Smoke test ────────────────────────────────────────────────────────────────

async function runSmokeTest(
  session: SessionState | null,
  config: ReturnType<typeof loadConfig>
): Promise<SessionState> {
  console.log('\n' + hr('═'));
  console.log('  SMOKE TEST — running all tools with default parameters');
  console.log(hr('═'));

  const tools: Array<{ name: string; fn: () => Promise<SessionState> }> = [
    { name: 'list_seasons',     fn: () => toolListSeasons(session, config) },
    { name: 'get_team_stats',   fn: () => toolGetTeamStats(session, config) },
    { name: 'get_game_results', fn: () => toolGetGameResults(session, config) },
    { name: 'get_player_stats', fn: () => toolGetPlayerStats(session, config) },
    { name: 'get_game_stats',   fn: () => toolGetGameStats(session, config, 'latest') },
  ];

  const results: Array<{ name: string; status: 'PASS' | 'FAIL'; error?: string }> = [];

  for (const { name, fn } of tools) {
    try {
      session = await fn();
      results.push({ name, status: 'PASS' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, status: 'FAIL', error: msg });
      console.error(`\n  [SMOKE TEST ERROR] ${name}: ${msg}`);
    }
  }

  console.log('\n' + hr('═'));
  console.log('  SMOKE TEST RESULTS');
  console.log(hr('─'));
  results.forEach(({ name, status, error }) => {
    const icon = status === 'PASS' ? '✔' : '✖';
    const line = `  ${icon}  ${status.padEnd(5)}  ${name}`;
    console.log(error ? `${line}\n          └─ ${error}` : line);
  });
  console.log(hr('═'));

  return session!;
}

// ── Menu ──────────────────────────────────────────────────────────────────────

function printMenu(): void {
  console.log('\n' + hr('─'));
  console.log('  Hudl MCP Test CLI');
  console.log(hr('─'));
  console.log('  Tools (as the LLM calls them):');
  console.log('    1.  list_seasons');
  console.log('    2.  get_team_stats        [optional: season]');
  console.log('    3.  get_game_results      [optional: season, limit]');
  console.log('    4.  get_player_stats      [optional: season, playerName]');
  console.log('    5.  get_game_stats        [optional: season, game]');
  console.log(hr('─'));
  console.log('  Diagnostics:');
  console.log('    t.  Run all tools (smoke test)');
  console.log(hr('─'));
  console.log('    0.  Exit');
  console.log(hr('─'));
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig();
  let session: SessionState | null = loadSession();

  console.log('\n' + hr('═'));
  console.log('  Hudl MCP Test CLI');
  console.log(`  Team ID: ${config.teamId}`);
  console.log('  Note: first call will open a browser and log in (~15s)');
  console.log('  Output is split: [DEBUG] scraper logs  |  [LLM] exact model payload');
  console.log(hr('═'));

  while (true) {
    printMenu();
    const choice = (await ask('  Enter choice: ')).trim();

    try {
      switch (choice) {
        case '1':
          session = await toolListSeasons(session, config);
          break;

        case '2': {
          const s = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await toolGetTeamStats(session, config, s || undefined);
          break;
        }

        case '3': {
          const s = (await ask('  Season ID (leave blank for current): ')).trim();
          const n = (await ask('  Limit (leave blank for all): ')).trim();
          const limit = n ? parseInt(n, 10) : undefined;
          session = await toolGetGameResults(session, config, isNaN(limit!) ? undefined : limit, s || undefined);
          break;
        }

        case '4': {
          const name = (await ask('  Player name filter (leave blank for all): ')).trim();
          const s = (await ask('  Season ID (leave blank for current): ')).trim();
          session = await toolGetPlayerStats(session, config, name || undefined, s || undefined);
          break;
        }

        case '5': {
          const s = (await ask('  Season ID (leave blank for current): ')).trim();
          const g = (await ask('  Game ("latest", opponent name, date, or 0-based index) [default: latest]: ')).trim();
          session = await toolGetGameStats(session, config, g || 'latest', s || undefined);
          break;
        }

        case 't':
        case 'T':
          session = await runSmokeTest(session, config);
          break;

        case '0':
          console.log('\nClosing browser and exiting...');
          await closeBrowser();
          rl.close();
          process.exit(0);
          break;

        default:
          console.log('  Invalid choice.');
      }
    } catch (err) {
      console.error('\n' + hr('─'));
      console.error('  [ERROR]', err instanceof Error ? err.message : err);
      console.error(hr('─'));
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
