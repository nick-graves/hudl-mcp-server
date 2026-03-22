# Hudl MCP Server — Progress Report
_Last updated: March 20, 2026_

## What This Project Is

An MCP (Model Context Protocol) server that connects Claude Desktop to a Hudl team account. It allows natural language questions like "Who is the leading scorer?" or "What's our record this season?" and returns real data from Hudl.

---

## What Was Built Today

### Authentication
- Implemented a full Playwright-based login flow for Hudl's two-step auth (username first, then password)
- Session cookies are cached in `.hudl-session.json` so login only happens once — subsequent tool calls reuse the session without re-authenticating
- 2FA fallback: if Hudl requires verification, the browser relaunches in visible mode so the user can complete it manually

### MCP Tools (4 total)

| Tool | Status | Method |
|------|--------|--------|
| `get_roster` | Working | Scrapes ReactVirtualized table on the team manage page with virtual scroll handling |
| `get_game_results` | Working | Scrapes team timeline page |
| `get_player_stats` | Working | Navigates to reports page, intercepts client-side CSV export in memory, parses all stat sections |
| `get_team_stats` | Working | Same CSV interception approach as player stats |

### Player Stats — All Sections Parsed
The player stats tool now returns the full stat set Hudl tracks, not just goals/assists:
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

This is more reliable than DOM scraping and uses Hudl's own export format.

### CLI Test Harness
A standalone CLI (`npm run cli`) with an interactive menu to test each tool without going through Claude Desktop:

```
1. Get Roster
2. Get Player Stats (all)
3. Get Player Stats (search by name)
4. Get Team Stats
5. Get Game Results
6. Get Game Results (limited)
0. Exit
```

Output is formatted as tables in the terminal, matching what Claude would receive.

---

## Project Structure

```
src/
  auth/
    hudlAuth.ts          — Login, session restore, 2FA handling
  browser/
    browserManager.ts    — Playwright browser lifecycle
    networkInterceptor.ts — API endpoint discovery
  cache/
    sessionCache.ts      — Read/write .hudl-session.json
  fetchers/
    reportsCsvFetcher.ts — Navigate to reports page, intercept CSV export
  scrapers/
    rosterScraper.ts     — Roster from team manage page
    gameResultsScraper.ts — Game results from team timeline
    playerStatsScraper.ts — Player stats via CSV interception
    teamStatsScraper.ts  — Team stats via CSV interception
  config.ts              — Loads env vars
  types.ts               — TypeScript interfaces
  server.ts              — MCP server definition and tool handlers
  index.ts               — Entry point
  cli.ts                 — Interactive test CLI
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
      "args": ["C:/Users/<your-username>/Desktop/Projects/hudl-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Known Limitations / Next Steps

- **Position data missing** from player stats — Hudl's reports page doesn't include position in the exported columns. Would need to cross-reference with the roster.
- **Multi-season support** ✅ Complete — `list_seasons` dynamically discovers all available seasons; `get_game_results` and `get_game_stats` accept an optional `seasonId` parameter for historical queries.
- **Single-game stats** ✅ Complete — `get_game_stats` returns full player-level stats for any specific game using fuzzy opponent name matching and date-based alignment.
- **Roster only shows current season members** — athletes from previous seasons who are no longer active won't appear.
- **No scheduled/automated refresh** — session is cached but if it expires the next tool call will trigger a full re-login.
- **Team stats tool** working but could return richer data (per-game breakdowns, opponent comparisons).

---

## What's Safe to Push to GitHub

The `.gitignore` covers all sensitive files:
- `.env` — credentials
- `.hudl-session.json` — session cookies
- `node_modules/` — dependencies
- `dist/` — compiled output

No credentials are hardcoded in source. All config comes from environment variables.
