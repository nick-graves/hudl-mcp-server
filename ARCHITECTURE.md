# Hudl MCP Server — Architecture & Design Document

_Last updated: March 2026_

---

## Purpose of This Document

`PROGRESS.md` tracks **what was built** and its current status.
This document explains **why it was built this way** — the design philosophy, the reasoning behind key decisions, and how the system is intended to grow.

---

## System Overview

This project connects Hudl to Claude Desktop and produces shareable reports from the resulting data. It is built as three distinct, independent layers:

```
┌────────────────────────────────────────────────────┐
│               PRESENTATION LAYER                   │
│         Standalone CLI / Python Utilities          │
│   Runs without Claude. Produces shareable files.   │
│   Examples: PDF season reports, season analyses    │
└────────────────────────────────────────────────────┘
                      ▲ data + analysis
┌────────────────────────────────────────────────────┐
│                REASONING LAYER                     │
│                 Claude (the AI)                    │
│   Calls MCP tools, interprets raw data, generates  │
│   analysis, narrative, comparisons, and insights   │
└────────────────────────────────────────────────────┘
                      ▲ raw structured data
┌────────────────────────────────────────────────────┐
│                  DATA LAYER                        │
│               MCP Server (Node.js)                 │
│   Hudl API/scraping gateway — handles auth,        │
│   session management, queries, and returns         │
│   clean structured JSON                            │
└────────────────────────────────────────────────────┘
```

Each layer has **one job**, can be tested independently, and can change without breaking the others.

---

## Layer 1 — The MCP Server (Data Layer)

### What It Does
The MCP server is a structured data gateway to Hudl. Its only job is to answer the question: *"Give me this specific data."* It does no interpretation, summarization, or analysis.

### Why MCP?
MCP (Model Context Protocol) is the standard way to give Claude structured access to external systems. Rather than pasting data into a chat or building a custom integration, MCP lets Claude call tools on demand — it's the equivalent of giving Claude a set of API endpoints it can use mid-conversation.

### Design Decisions

**Authentication is handled once, in one place.**
Hudl uses a multi-step login flow (username, then password, with optional 2FA). This is complex and stateful. Centralizing it in the MCP server — with session cookie caching — means Claude never deals with auth. If Hudl changes their login flow, one file changes, nothing else does.

**CSV interception instead of DOM scraping.**
Rather than scraping HTML elements for stats (which breaks when Hudl updates their UI), the stats tools intercept Hudl's own client-side CSV export in memory. This uses Hudl's own data format, which is far more stable than their DOM structure. The data is parsed and returned as clean JSON — nothing is written to disk.

**Tools return raw data, not conclusions.**
The MCP server never decides whether a stat is good or bad. It doesn't know what a strong shooting percentage looks like in lacrosse. That judgment belongs to the reasoning layer. The server's job is accuracy and completeness of the data, not interpretation.

**Multi-season support is a first-class design.**
Game IDs, seasons, and rosters are fetched dynamically rather than hardcoded. This was intentional — a system that only works for one season has limited long-term value. Supporting multiple seasons also enables cross-season comparisons, which adds significant analytical value.

### Available Tools

| Tool | Description |
|------|-------------|
| `get_roster` | Current team roster with player details |
| `get_player_stats` | Full player stat export (all sections) |
| `get_player_stats` (by name) | Filtered stats for a single player |
| `get_team_stats` | Aggregated team statistics |
| `get_game_results` | Full season game results with scores |
| `get_game_results` (limited) | Most recent N games |
| `list_seasons` | All available seasons for the team |
| `get_game_stats` | Stats for a single specific game |
| `exit` | CLI tool exit (test harness only) |

---

## Layer 2 — Claude (Reasoning Layer)

### What It Does
Claude receives structured JSON from the MCP server and applies reasoning: identifying patterns, comparing players, flagging concerns, constructing narratives, and synthesizing data into insight.

### Why Claude Handles Analysis (Not the MCP Server)
Analysis requires **judgment**, and judgment is context-dependent:
- *"Is a 40% shooting percentage good?"* — depends on the sport, position, and game situation
- *"Who had a standout performance?"* — requires comparing players against each other and against their own averages
- *"What should the coach focus on?"* — requires weighing multiple factors and understanding team goals

Hard-coding these interpretations into the MCP server would produce rigid, potentially wrong conclusions. Claude can adapt its analysis based on how the question is asked, what context the user provides, and what the data actually shows.

### The Clean Hand-Off
The MCP-to-Claude boundary is intentionally clean:
- MCP returns: structured JSON with consistent field names
- Claude receives: reliable, predictable data it can trust
- Claude produces: narrative, tables, comparisons, recommendations

This also means the same MCP data can support different kinds of analysis — a quick summary, a deep player breakdown, or a season-over-season trend analysis — without changing any server code.

---

## Layer 3 — CLI Utilities (Presentation Layer)

### What They Do
Standalone Python scripts that produce shareable files (PDFs, analyses) from the data and analysis generated in the reasoning layer.

### Why Separate from MCP and Claude?

**Repeatability without AI overhead.**
Once a report format is designed and approved, you don't need Claude to regenerate it. A script runs in seconds, produces identical output every time, and requires no conversation. `python aloha_lacrosse_report.py` always produces the same structured report from the same data.

**Artifacts that live outside the conversation.**
Claude's responses exist in a chat window. A PDF exists on disk — it can be emailed to parents, shared with athletic directors, printed for the sideline, or archived. The CLI utilities bridge the gap between AI-generated analysis and real-world deliverables.

**Presentation logic is code, not prompts.**
The styling decisions — colors, logo placement, table formatting, section order — are explicit in code. They're version-controlled, reviewable, and permanent. You don't need to re-prompt Claude with the right instructions every time you want the same format.

**Each utility can be improved independently.**
The PDF report can be redesigned without touching the MCP server or changing how Claude fetches data. A new section can be added to the report without changing anything else in the system.

### Current Utilities

| Script | Purpose |
|--------|---------|
| `aloha_lacrosse_report.py` | Multi-game season report with player and team analysis — branded with team logo and colors |
| `generate_2024_season_pdf.py` | 2024 full season analysis |
| `generate_2023_season_pdf.py` | 2023 full season analysis |
| `generate_2018_stats_pdf.py` | 2018 historical stats |

---

## The CLI Test Harness (`npm run cli`)

This is separate from the standalone utilities above. It is a **developer tool** — an interactive terminal menu that calls each MCP tool directly without going through Claude Desktop. Its purpose is to verify that the MCP server is working correctly before relying on it in a conversation.

This was built because debugging MCP issues through Claude Desktop is slow — you can't see raw responses, error messages are buried, and the server restart cycle is friction-heavy. The CLI harness gives direct, immediate feedback.

**It is not intended for end-user use.** It is a testing and development utility.

---

## What Intentionally Stays Out of This System

**Credentials and session data** are never in source code. All secrets live in `.env` and `.hudl-session.json`, both excluded from version control. This is non-negotiable — a leaked Hudl session token could expose an entire team's film and data.

**Analysis logic is not in the MCP server.** The server returns facts. Whether those facts represent good or bad performance is always left to Claude or to a human.

**The MCP server does not write to Hudl.** All operations are read-only. The server fetches and returns data; it never submits forms, modifies rosters, or changes any data in Hudl.

---

## How the Layers Interact — A Typical Request

**User asks:** *"Show me player stats and analysis for our first two games this season."*

```
1. Claude calls list_seasons       → identifies current season ID
2. Claude calls get_game_results   → finds first two game IDs and opponents
3. Claude calls get_game_stats x2  → fetches raw stats for each game
4. Claude calls get_team_stats     → fetches season-level team data for context
5. Claude synthesizes              → compares game-to-game, identifies trends,
                                     flags standout performers and areas of concern
6. User requests PDF               → Claude's analysis is formatted into a
                                     branded PDF via the presentation layer utility
```

No single layer could do all of this. Each layer handles exactly what it's designed for.

---

## Future Extensibility

The three-layer design makes new capabilities straightforward to add:

- **New data source** (e.g., MaxPreps, game film metadata) → add a new MCP tool; Claude and utilities don't change
- **New report format** (e.g., per-player card, scouting report) → add a new CLI utility; MCP and Claude don't change
- **New analysis type** (e.g., opponent scouting) → just ask Claude differently; nothing in the system changes
- **Scheduled reports** → wrap a CLI utility in a scheduled task; the rest of the system doesn't change

---

## File Reference

```
hudl-mcp-server/
  src/
    auth/            — Hudl login, session restore, 2FA handling
    browser/         — Playwright browser lifecycle and network interception
    cache/           — Session cookie read/write
    fetchers/        — Navigate to reports pages, intercept CSV export
    scrapers/        — Roster and game results scrapers
    server.ts        — MCP tool definitions and handlers
    cli.ts           — Interactive developer test harness
    config.ts        — Environment variable loading
    types.ts         — TypeScript interfaces

  aloha_lacrosse_report.py     — Current season branded PDF report
  generate_2024_season_pdf.py  — 2024 season analysis utility
  generate_2023_season_pdf.py  — 2023 season analysis utility
  generate_2018_stats_pdf.py   — 2018 historical stats utility

  ARCHITECTURE.md   — This document (design philosophy and decisions)
  PROGRESS.md       — Build progress, current status, known limitations
  .env              — Credentials (never committed)
  .hudl-session.json — Cached session (never committed)
```
