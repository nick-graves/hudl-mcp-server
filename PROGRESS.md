# Hudl MCP Server — Progress Report
_Last updated: April 11, 2026_

## What This Project Is

An MCP (Model Context Protocol) server that connects Claude Desktop to a Hudl team account. It allows natural language questions like "Who is the leading scorer?" or "What's our record this season?" and returns real data from Hudl.

---

## Current Status

The MCP server is **feature complete** for its current scope. All 8 tools are working and stable. The repo is published at [nick-graves/hudl-mcp-server](https://github.com/nick-graves/hudl-mcp-server).

---

## MCP Tools (8 total)

| Tool | Status | Method |
|------|--------|--------|
| `get_roster` | ✅ Working | Scrapes ReactVirtualized table on the team manage page with virtual scroll handling |
| `get_game_results` | ✅ Working | Scrapes team timeline page; season-aware |
| `get_player_stats` | ✅ Working | Navigates to reports page, intercepts client-side CSV export in memory, parses all stat sections |
| `get_team_stats` | ✅ Working | Same CSV interception approach as player stats; extended with GB, saves, FO%, TOs, clears, blocks, man-up, possession |
| `list_seasons` | ✅ Working | Dynamically discovers all available seasons via Hudl API |
| `get_game_stats` | ✅ Working | Per-game player stats for any specific game; fuzzy opponent name matching + date-based alignment |
| `get_box_score` | ✅ Working | Team-level box score comparison (AHS vs opponent); single-game totals or season aggregates |
| `clear_cache` | ✅ Working | Invalidate cache entries — all, by season label, or by game identifier |

All tools accept an optional `season` parameter for historical queries.
All tools accept an optional `refresh: true` parameter to bypass cache.

---

## What Was Built

### Authentication
- Full Playwright-based login flow for Hudl's two-step auth (username first, then password)
- Session cookies cached in `.hudl-session.json` — subsequent calls reuse the session without re-authenticating
- 2FA fallback: browser relaunches in visible mode so the user can complete verification manually

### Player Stats — All Sections Parsed
The player stats tool returns the full stat set Hudl tracks:
- **Offense**: G, A, P, Shots, Shots on Target, Shot %, Ground Balls, Extra Man Goals
- **Face-Offs**: FO, FOW, FOL, FO%
- **Turnovers**: Total, Forced, Unforced, Caused
- **Defense/Goalies**: Goals Allowed, Saves, Save %
- **Penalties**

### CSV Interception Approach
Rather than scraping DOM elements (which is fragile), the stats tools:
1. Navigate to the Hudl reports page with the correct URL parameters (season, games, stat type)
2. Wait for the data to load
3. Intercept the client-side CSV export by patching `URL.createObjectURL` in the page context
4. Parse the CSV in memory — nothing written to disk
5. Return structured JSON to Claude

### Multi-Season Support
`list_seasons` dynamically discovers all seasons via the Hudl API. All game and stats tools accept a `season` parameter, enabling cross-season comparisons and historical queries going back to the earliest Hudl data for the team.

### Single-Game Stats
`get_game_stats` returns full player-level stats for any specific game. Games are identified by opponent name (fuzzy matched), date string, or 0-based index. Date-based alignment is used to correctly match game IDs across the Hudl API and reports endpoints.

### Transparent JSON Cache Layer
All tool results are cached to `.cache/` using SHA1-keyed JSON files:
- **Completed games** (`get_game_stats`, `get_box_score` by opponent/date): `GAME_PERMANENT` TTL — never expire
- **Prior completed seasons** (warmed via CLI): `SEASON_PERMANENT` TTL — never expire
- **Current season aggregates** (`get_team_stats`, `get_player_stats`): `SEASON_24H` TTL — refresh daily
- **All tools** accept `refresh: true` to bypass cache and re-fetch from Hudl
- `HUDL_CACHE_DIR` env var sets a stable absolute cache path (prevents fragmentation when CLI is run from different directories)

### CLI
A standalone CLI (`npm run cli`) with a full interactive menu:
- **Tools 1–6**: call each MCP tool directly, inspect raw JSON response
- **`c`**: list all cache entries with age and TTL
- **`ci`**: inspect a cache entry — full JSON payload
- **`cc`**: clear cache — all, by season label, or by keyword
- **`w` (warm)**: bulk-fetch and permanently cache all game stats and box scores for a season — key tool for backfilling prior seasons after a fresh install
- **`t`**: smoke test all tools

---

## Project Structure

```
src/
  auth/
    hudlAuth.ts           — Login, session restore, 2FA handling
  browser/
    browserManager.ts     — Playwright browser lifecycle
    networkInterceptor.ts — API endpoint discovery
  cache/
    sessionCache.ts       — Read/write .hudl-session.json
  fetchers/
    reportsCsvFetcher.ts  — Navigate to reports page, intercept CSV export
  scrapers/
    rosterScraper.ts      — Roster from team manage page
    gameResultsScraper.ts — Game results from team timeline
    gameStatsScraper.ts   — Per-game player stats with fuzzy matching
    playerStatsScraper.ts — Player stats via CSV interception
    teamStatsScraper.ts   — Team stats via CSV interception
  config.ts               — Loads env vars
  types.ts                — TypeScript interfaces
  server.ts               — MCP server definition and tool handlers
  index.ts                — Entry point
  cli.ts                  — Interactive test CLI
```

---

## Configuration

### `.env` (never committed)
```
HUDL_EMAIL=...
HUDL_PASSWORD=...
HUDL_TEAM_ID=...
```

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "hudl": {
      "command": "node",
      "args": ["C:/path/to/hudl-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Known Limitations

- **Position data missing** from player stats — Hudl's reports page doesn't include position in the exported CSV columns. Would need to cross-reference with the roster.
- **Roster only shows current season members** — athletes from previous seasons who are no longer active won't appear.
- **No automated session refresh** — session is cached but if it expires the next tool call triggers a full re-login.
- **Team stats** working but could return richer data (per-game breakdowns, opponent comparisons).

---

## Companion Project

PDF game and season report generation lives in the separate **`alc-lacrosse-reports`** repo. It consumes data from this MCP server via Claude and produces branded PDF reports (Game Recap + Coach Report) for each game and season.

---

## What's Safe to Push to GitHub

The `.gitignore` covers all sensitive files:
- `.env` — credentials
- `.hudl-session.json` — session cookies
- `node_modules/` — dependencies
- `dist/` — compiled output
- `.claude/` — Claude Code worktrees and internals

No credentials are hardcoded in source. All config comes from environment variables.
