import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HudlConfig, SessionState } from './types.js';
import { loadSession, saveSession } from './cache/sessionCache.js';
import { ensureAuthenticated } from './auth/hudlAuth.js';
import { scrapeTeamStats } from './scrapers/teamStatsScraper.js';
import { scrapePlayerStats } from './scrapers/playerStatsScraper.js';
import { scrapeGameResults } from './scrapers/gameResultsScraper.js';
import { scrapeRoster } from './scrapers/rosterScraper.js';
import { scrapeGameStats } from './scrapers/gameStatsScraper.js';
import { listAvailableSeasons } from './fetchers/reportsCsvFetcher.js';

export function createServer(config: HudlConfig): McpServer {
  // Session is held in memory for the lifetime of the process
  let session: SessionState | null = loadSession();

  const onSessionUpdate = (updated: SessionState) => {
    session = updated;
    saveSession(updated);
  };

  const server = new McpServer(
    { name: 'hudl-mcp-server', version: '1.0.0' },
    {
      instructions:
        'Provides access to Hudl lacrosse team data for Aloha High School including team stats, ' +
        'player stats, game results, and the roster. Data is fetched via authenticated browser ' +
        'automation. The first call per session may take 10-20 seconds while the browser starts.',
    }
  );

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
      },
    },
    async ({ season }) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const stats = await scrapeTeamStats(page, session, config.teamId, onSessionUpdate, season);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
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
      },
    },
    async ({ playerName, season }) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const players = await scrapePlayerStats(
        page,
        session,
        config.teamId,
        onSessionUpdate,
        playerName,
        season
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(players, null, 2),
          },
        ],
      };
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
      },
    },
    async ({ limit, season }) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const games = await scrapeGameResults(
        page,
        session,
        config.teamId,
        onSessionUpdate,
        limit,
        season
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(games, null, 2),
          },
        ],
      };
    }
  );

  // ── get_roster ─────────────────────────────────────────────────────────────
  server.registerTool(
    'get_roster',
    {
      description:
        'Get the full team roster with player names, jersey numbers, and positions.',
      inputSchema: {
        season: z
          .string()
          .optional()
          .describe('Season identifier. Defaults to current season.'),
      },
    },
    async (_args) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const roster = await scrapeRoster(page, session, config.teamId, onSessionUpdate);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(roster, null, 2),
          },
        ],
      };
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
      inputSchema: {},
    },
    async (_args) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const seasons = await listAvailableSeasons(page, config.teamId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(seasons, null, 2),
          },
        ],
      };
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
      },
    },
    async ({ game, season }) => {
      const { page, session: freshSession } = await ensureAuthenticated(session, config);
      session = freshSession;

      const result = await scrapeGameStats(
        page,
        session,
        config.teamId,
        onSessionUpdate,
        game ?? 'latest',
        season,
      );

      return {
        content: [
          {
            type: 'text',
            text: result ? JSON.stringify(result, null, 2) : 'No data found for the specified game.',
          },
        ],
      };
    }
  );

  return server;
}
