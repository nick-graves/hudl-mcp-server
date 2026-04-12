import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HudlConfig, SessionState } from './types.js';
import { loadSession, saveSession } from './cache/sessionCache.js';
import { DataCache, TTL } from './cache/dataCache.js';
import { ensureAuthenticated } from './auth/hudlAuth.js';
import { scrapeTeamStats } from './scrapers/teamStatsScraper.js';
import { scrapePlayerStats } from './scrapers/playerStatsScraper.js';
import { scrapeGameResults } from './scrapers/gameResultsScraper.js';
import { scrapeGameStats } from './scrapers/gameStatsScraper.js';
import { scrapeBoxScore } from './scrapers/boxScoreScraper.js';
import { listAvailableSeasons } from './fetchers/reportsCsvFetcher.js';

export function createServer(config: HudlConfig): McpServer {
  // Session is held in memory for the lifetime of the process
  let session: SessionState | null = loadSession();

  const onSessionUpdate = (updated: SessionState) => {
    session = updated;
    saveSession(updated);
  };

  // Data cache — persists across restarts in .cache/ directory
  const cache = new DataCache(process.env.HUDL_CACHE_DIR);

  /**
   * Determine whether a caller-supplied season string refers to the current
   * (still-accumulating) season or a completed prior season.
   *
   * Strategy:
   *   1. If no season was supplied, it is definitely the current season.
   *   2. Try to read the cached season list (key: list_seasons|<teamId>).
   *      The list is sorted newest-first, so index 0 is always current.
   *   3. Compare the supplied value against the current season's label
   *      (e.g. "2025-2026 Season") using startsWith, so both "2025-2026"
   *      and "2025-2026 Season" match, as well as the raw numeric seasonId.
   *   4. If the season list is not cached yet, fall back to treating the
   *      season as current (safe: applies the shorter 24 h TTL rather than
   *      permanently caching data that may still be changing).
   *
   * Returns true when the season is prior/completed (use GAME_PERMANENT),
   * false when it is the current season (use SEASON_24H).
   */
  function isPriorSeason(season: string | undefined): boolean {
    if (!season) return false; // no season arg → current season

    const seasonsCacheKey = `list_seasons|${config.teamId}`;
    const seasons = cache.get<Array<{ seasonId: string; label: string; seasonYear: number }>>(seasonsCacheKey);

    if (!seasons || seasons.length === 0) {
      // Season list not cached — cannot determine; assume current (safe fallback)
      console.error(`[ttl] Season list not cached — treating season="${season}" as current`);
      return false;
    }

    const current = seasons[0]; // newest-first → index 0 is current
    const matchesCurrent =
      current.label.startsWith(season) ||   // "2025-2026" matches "2025-2026 Season"
      current.seasonId === season;           // numeric ID match

    if (!matchesCurrent) {
      console.error(`[ttl] season="${season}" is a prior season — using PERMANENT cache`);
    } else {
      console.error(`[ttl] season="${season}" matches current season "${current.label}" — using 24 h cache`);
    }

    return !matchesCurrent;
  }

  const server = new McpServer(
    { name: 'hudl-mcp-server', version: '1.0.0' },
    {
      instructions:
        'Provides access to Hudl lacrosse team data for Aloha High School including team stats, ' +
        'player stats, and game results. Data is fetched via authenticated browser ' +
        'automation. The first call per session may take 10-20 seconds while the browser starts.',
    }
  );

  // ── Helper: authenticate only when needed ──────────────────────────────────
  async function authenticate() {
    const { page, session: freshSession } = await ensureAuthenticated(session, config);
    session = freshSession;
    return page;
  }

  // ── get_team_stats ─────────────────────────────────────────────────────────
  server.registerTool(
    'get_team_stats',
    {
      description:
        'Get overall team statistics for a season: win/loss/tie record, goals scored and ' +
        'allowed, and win percentage.',
      inputSchema: {
        season: z
          .string()
          .optional()
          .describe('Season identifier e.g. "2024-2025". Defaults to current season.'),
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ season, refresh }) => {
      const cacheKey = `get_team_stats|${season ?? 'current'}`;
      const label    = `get_team_stats season=${season ?? 'current'}`;

      if (!refresh) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page  = await authenticate();
      const stats = await scrapeTeamStats(page, session!, config.teamId, onSessionUpdate, season);
      // Prior/completed seasons are immutable — cache permanently.
      // Current season (no explicit season arg, or current season label) accumulates — refresh daily.
      const teamStatsTtl = isPriorSeason(season) ? TTL.GAME_PERMANENT : TTL.SEASON_24H;
      cache.set(cacheKey, label, stats, teamStatsTtl);

      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    }
  );

  // ── get_player_stats ───────────────────────────────────────────────────────
  server.registerTool(
    'get_player_stats',
    {
      description:
        'Get individual player statistics including goals, assists, points, and games played. ' +
        'Optionally filter by player name.',
      inputSchema: {
        playerName: z
          .string()
          .optional()
          .describe('Filter by player name (partial match). Omit to get all players.'),
        season: z
          .string()
          .optional()
          .describe('Season identifier. Defaults to current season.'),
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ playerName, season, refresh }) => {
      const filterKey = playerName ? playerName.toLowerCase().replace(/\s+/g, '_') : 'ALL';
      const cacheKey  = `get_player_stats|${season ?? 'current'}|${filterKey}`;
      const label     = `get_player_stats season=${season ?? 'current'} filter=${filterKey}`;

      if (!refresh) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page    = await authenticate();
      const players = await scrapePlayerStats(
        page, session!, config.teamId, onSessionUpdate, playerName, season
      );
      // Prior/completed seasons are immutable — cache permanently.
      // Current season (no explicit season arg, or current season label) accumulates — refresh daily.
      const playerStatsTtl = isPriorSeason(season) ? TTL.GAME_PERMANENT : TTL.SEASON_24H;
      cache.set(cacheKey, label, players, playerStatsTtl);

      return { content: [{ type: 'text', text: JSON.stringify(players, null, 2) }] };
    }
  );

  // ── get_game_results ───────────────────────────────────────────────────────
  server.registerTool(
    'get_game_results',
    {
      description:
        'Get game-by-game results: opponent, date, score, home/away, and win/loss/tie outcome.',
      inputSchema: {
        season: z
          .string()
          .optional()
          .describe('Season identifier. Defaults to current season.'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of games to return. Omit for all games.'),
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ limit, season, refresh }) => {
      // Include limit in key — different limits produce different result sets
      const cacheKey = `get_game_results|${season ?? 'current'}|limit=${limit ?? 'all'}`;
      const label    = `get_game_results season=${season ?? 'current'} limit=${limit ?? 'all'}`;

      if (!refresh) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page  = await authenticate();
      const games = await scrapeGameResults(
        page, session!, config.teamId, onSessionUpdate, limit, season
      );
      // Prior/completed seasons are immutable — cache permanently.
      // Current season (no explicit season arg, or current season label) accumulates — refresh daily.
      const gameResultsTtl = isPriorSeason(season) ? TTL.GAME_PERMANENT : TTL.SEASON_24H;
      cache.set(cacheKey, label, games, gameResultsTtl);

      return { content: [{ type: 'text', text: JSON.stringify(games, null, 2) }] };
    }
  );

  // ── list_seasons ───────────────────────────────────────────────────────────
  server.registerTool(
    'list_seasons',
    {
      description:
        'List all available seasons for the team, sorted newest first. ' +
        'Returns seasonId, label (e.g. "2024-2025 Season"), and seasonYear. ' +
        'Use the seasonId value with get_team_stats, get_player_stats, or get_game_results ' +
        'to retrieve data for a specific historical season.',
      inputSchema: {
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ refresh }) => {
      const cacheKey = `list_seasons|${config.teamId}`;
      const label    = `list_seasons teamId=${config.teamId}`;

      if (!refresh) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page    = await authenticate();
      const seasons = await listAvailableSeasons(page, config.teamId);
      cache.set(cacheKey, label, seasons, TTL.SEASON_24H);

      return { content: [{ type: 'text', text: JSON.stringify(seasons, null, 2) }] };
    }
  );

  // ── get_game_stats ─────────────────────────────────────────────────────────
  server.registerTool(
    'get_game_stats',
    {
      description:
        'Get per-game player statistics for a single specified game: goals, assists, shots, ' +
        'saves, faceoffs, and turnovers for every player, filtered to that one game only. ' +
        'Use the game parameter to identify which game: "latest" returns the most recent game, ' +
        'an opponent name (e.g. "Beaverton") returns the most recent game vs that opponent, ' +
        'a date string (e.g. "May 18") targets that specific game, or a numeric index ' +
        '(0 = most recent, 1 = second most recent, etc.) selects by position. ' +
        'If an opponent was played multiple times in the season, a warning is logged and the ' +
        'most recent match is returned — use a date or index to select a specific game.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            'Game identifier: "latest" (default), opponent name, date (e.g. "May 18"), ' +
            'or 0-based index newest-first. Use a date when the same opponent appears multiple times.'
          ),
        season: z
          .string()
          .optional()
          .describe('Season identifier. Defaults to current season.'),
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ game, season, refresh }) => {
      const gameId   = game ?? 'latest';
      const cacheKey = `get_game_stats|${season ?? 'current'}|${gameId}`;
      const label    = `get_game_stats season=${season ?? 'current'} game=${gameId}`;

      // "latest" and numeric indices are volatile (point to different games as
      // the season progresses) — only cache stable identifiers like opponent
      // names, dates, or resolved uniqueGameIds.
      const isStable = gameId !== 'latest' && !/^\d+$/.test(gameId);

      if (!refresh && isStable) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page   = await authenticate();
      const result = await scrapeGameStats(
        page, session!, config.teamId, onSessionUpdate, gameId, season
      );

      // Cache completed games permanently; use TTL_24H only for "latest"
      if (result && isStable) {
        cache.set(cacheKey, label, result, TTL.GAME_PERMANENT);
      }

      return {
        content: [{
          type: 'text',
          text: result ? JSON.stringify(result, null, 2) : 'No data found for the specified game.',
        }],
      };
    }
  );

  // ── get_box_score ──────────────────────────────────────────────────────────
  server.registerTool(
    'get_box_score',
    {
      description:
        'Get the team-level box score comparison between Aloha and their opponent, ' +
        'showing how each team performed across all statistical categories. ' +
        'Use game="season" to get season averages across all games, or specify a ' +
        'game the same way as get_game_stats: "latest" (default), opponent name ' +
        '(e.g. "Beaverton"), date (e.g. "May 18"), or 0-based index newest-first. ' +
        'Single-game results use totals; season results use per-game averages.',
      inputSchema: {
        game: z
          .string()
          .optional()
          .describe(
            'Game identifier: "latest" (default), "season" for full-season averages, ' +
            'opponent name, date (e.g. "May 18"), or 0-based index newest-first.'
          ),
        season: z
          .string()
          .optional()
          .describe('Season identifier. Defaults to current season.'),
        refresh: z
          .boolean()
          .optional()
          .describe('Set true to bypass cache and re-fetch from Hudl.'),
      },
    },
    async ({ game, season, refresh }) => {
      const gameId   = game ?? 'latest';
      const cacheKey = `get_box_score|${season ?? 'current'}|${gameId}`;
      const label    = `get_box_score season=${season ?? 'current'} game=${gameId}`;

      const isStable = gameId !== 'latest' && !/^\d+$/.test(gameId);
      const isSeasonScope = gameId === 'season';

      if (!refresh && isStable) {
        const cached = cache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const page   = await authenticate();
      const result = await scrapeBoxScore(
        page, session!, config.teamId, onSessionUpdate, gameId, season
      );

      if (result && isStable) {
        // Season-scope box scores accumulate; game box scores are permanent
        const ttl = isSeasonScope ? TTL.SEASON_24H : TTL.GAME_PERMANENT;
        cache.set(cacheKey, label, result, ttl);
      }

      return {
        content: [{
          type: 'text',
          text: result ? JSON.stringify(result, null, 2) : 'No box score data found for the specified game.',
        }],
      };
    }
  );

  // ── clear_cache ────────────────────────────────────────────────────────────
  server.registerTool(
    'clear_cache',
    {
      description:
        'Invalidate cached Hudl data so the next request re-fetches from Hudl. ' +
        'Use scope="all" to wipe everything. Use scope="season" with a season label ' +
        '(e.g. "2024-2025") to clear all entries for that season. Use scope="game" ' +
        'with a game identifier (opponent name or date) to clear a single game. ' +
        'Omitting scope defaults to "all". ' +
        'After clearing, the next tool call will re-scrape Hudl and rebuild the cache.',
      inputSchema: {
        scope: z
          .enum(['all', 'season', 'game'])
          .optional()
          .describe('"all" (default) = clear everything; "season" = clear one season; "game" = clear one game.'),
        identifier: z
          .string()
          .optional()
          .describe(
            'Required when scope is "season" or "game". ' +
            'For season: a label like "2024-2025". ' +
            'For game: an opponent name (e.g. "Oregon City") or date (e.g. "Mar 17").'
          ),
        list: z
          .boolean()
          .optional()
          .describe('Set true to list current cache contents without clearing anything.'),
      },
    },
    async ({ scope, identifier, list }) => {
      // List mode — no deletion
      if (list) {
        const entries = cache.list();
        if (entries.length === 0) {
          return { content: [{ type: 'text', text: 'Cache is empty.' }] };
        }
        const lines = entries.map(e =>
          `• ${e.key}  |  cached ${e.cachedAt}  |  ttl: ${e.ttl}${e.expired ? '  ⚠ expired' : ''}`
        );
        return { content: [{ type: 'text', text: `Cache contents (${entries.length} entries):\n\n${lines.join('\n')}` }] };
      }

      const resolvedScope = scope ?? 'all';

      if (resolvedScope === 'all') {
        const n = cache.invalidate('all');
        return { content: [{ type: 'text', text: `Cache cleared — ${n} entries removed. All subsequent requests will re-fetch from Hudl.` }] };
      }

      if (!identifier) {
        return { content: [{ type: 'text', text: `Please provide an identifier when scope is "${resolvedScope}". Example: identifier="2024-2025" or identifier="Oregon City".` }] };
      }

      const n = cache.invalidateMatching(identifier);
      const noun = resolvedScope === 'season' ? `season "${identifier}"` : `game "${identifier}"`;
      return {
        content: [{
          type: 'text',
          text: n > 0
            ? `Cleared ${n} cache entries for ${noun}. Next request will re-fetch from Hudl.`
            : `No cache entries found matching "${identifier}". Nothing was cleared.`,
        }],
      };
    }
  );

  return server;
}
