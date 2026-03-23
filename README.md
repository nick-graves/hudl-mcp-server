# hudl-mcp-server

An MCP (Model Context Protocol) server that connects Claude Desktop to Hudl, giving Claude live access to team stats, player stats, and game results through natural language.

---

## What It Does

Ask Claude questions like:
- *"Who is the leading scorer this season?"*
- *"What's our record against ranked opponents?"*
- *"Show me player stats for our last game against Beaverton."*
- *"How did our faceoff percentage compare between 2023 and 2024?"*

Claude calls the MCP tools, retrieves live data from Hudl, and returns structured analysis — no copy-pasting, no manual exports.

---

## How It Works

The server uses Playwright to authenticate with Hudl and retrieve data via a combination of page scraping and CSV export interception. A session cookie is cached after the first login so subsequent calls are fast. If Hudl requires 2FA, the browser launches in visible mode so you can complete it manually.

```
Claude Desktop  →  MCP Tools  →  Hudl (via Playwright)
                ←  JSON data  ←
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_seasons` | Lists all available seasons with IDs, sorted newest first |
| `get_game_results` | Season game results — scores, opponents, home/away, W/L |
| `get_player_stats` | Full player stat export — goals, assists, shots, faceoffs, turnovers, saves, and more |
| `get_team_stats` | Aggregated team stats — record, goals scored/allowed, win % |
| `get_game_stats` | Per-game player stats for a single specific game |

All tools accept an optional `season` parameter to query historical seasons.

---

## Project Structure

```
src/
  auth/
    hudlAuth.ts           — Hudl login flow, session restore, 2FA handling
  browser/
    browserManager.ts     — Playwright browser lifecycle
    networkInterceptor.ts — API endpoint discovery utilities
  cache/
    sessionCache.ts       — Read/write cached session cookies
  fetchers/
    reportsCsvFetcher.ts  — Navigate to reports page, intercept CSV export
  scrapers/
    gameResultsScraper.ts — Game results from team timeline
    gameStatsScraper.ts   — Per-game player stats with fuzzy opponent matching
    playerStatsScraper.ts — Full player stats via CSV interception
    teamStatsScraper.ts   — Team stats via CSV interception
  config.ts               — Environment variable loading
  types.ts                — TypeScript interfaces
  server.ts               — MCP server definition and tool handlers
  index.ts                — Entry point
  cli.ts                  — Interactive developer test harness
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

This also runs `playwright install chromium` automatically.

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```
HUDL_EMAIL=your@email.com
HUDL_PASSWORD=yourpassword
HUDL_TEAM_ID=your_team_id
```

To find your `HUDL_TEAM_ID`, navigate to your team page in Hudl — it's in the URL.

### 3. Build

```bash
npm run build
```

### 4. Configure Claude Desktop

Add the server to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

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

Restart Claude Desktop. The Hudl tools will be available in your next conversation.

---

## Testing Without Claude Desktop

A CLI test harness lets you exercise each tool directly from the terminal:

```bash
npm run cli
```

This opens an interactive menu to call each tool and inspect the raw JSON response — useful for verifying your setup before connecting Claude Desktop.

---

## Notes

- **First call per session** may take 10–20 seconds while the browser starts and authenticates
- **Session is cached** in `.hudl-session.json` — subsequent calls reuse the session without re-logging in
- **2FA**: if Hudl prompts for verification, the browser will open visibly so you can complete it manually
- **Read-only**: the server never modifies any data in Hudl
- `.env` and `.hudl-session.json` are excluded from version control — never commit credentials

---

## Related

- [`alc-lacrosse-reports`](https://github.com/nwnittany-ai/alc-lacrosse-reports) — companion repo that uses this MCP server to generate branded PDF game and season reports
