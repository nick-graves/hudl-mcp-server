import type { Page } from 'playwright';

// ── Season / game ID discovery ─────────────────────────────────────────────

export interface GameEvent {
  uniqueGameId: string;
  /** ISO date string if the events API provides one (e.g. "2019-04-04T00:00:00Z") */
  date?: string;
}

export interface SeasonContext {
  seasonId: string;
  uniqueGameIds: string[]; // e.g. ["32839303-a1b3", "32853727-bc42"]
  gameEvents: GameEvent[]; // enriched — uniqueGameId + date when available
}

/**
 * Navigate to the reports page and return the season context (season ID +
 * game IDs) needed to build report URLs.
 *
 * @param seasonId  Optional. When provided the given season is used directly
 *                  and the redirect-URL discovery step is skipped.  When
 *                  omitted the current season is discovered automatically from
 *                  the reports-page redirect — identical to the original
 *                  behaviour, so all existing callers are unaffected.
 */
export async function getSeasonContext(
  page: Page,
  teamId: string,
  seasonId?: string
): Promise<SeasonContext> {
  // When a specific season is requested, include it in the navigation URL so
  // that Hudl's client-side JavaScript loads the correct season context and
  // populates the full stats URL (including G[]= game IDs) in the address bar.
  const navUrl = seasonId
    ? `https://www.hudl.com/reports/teams/${teamId}?S=${seasonId}`
    : `https://www.hudl.com/reports/teams/${teamId}`;

  await page.goto(navUrl, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // If a specific season was requested use it directly; otherwise read the
  // season ID that Hudl redirected us to (current season).
  if (!seasonId) {
    const url = new URL(page.url());
    seasonId = url.searchParams.get('S') ?? '';
    if (!seasonId) throw new Error('Could not determine current season ID from reports redirect');
    console.error(`[season-ctx] Current season from redirect: ${seasonId}`);
  } else {
    console.error(`[season-ctx] Using requested season: ${seasonId}`);
  }

  // Fetch event IDs for this season
  const resolvedId = seasonId; // narrowed to string above
  const eventIds: string[] = await page.evaluate(
    async (apiUrl: string) => {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    `https://www.hudl.com/reports/teams/${teamId}/season/${resolvedId}/eventids`
  );

  console.error(`[season-ctx] Found ${eventIds.length} event IDs for season ${resolvedId}`);

  if (eventIds.length === 0) {
    // The eventids API only works for recent seasons.  For historical seasons
    // fall back to /api/v2/teams/{teamId}/seasons, which returns a flat list
    // of both season entries and game entries.  Season entries have a linkId
    // matching the seasonId; game entries have a parentId matching the season
    // entry's categoryId.  We use the game linkId values as event IDs to
    // resolve uniqueGameId values via the events API.
    console.error(`[season-ctx] eventids empty — trying /api/v2 fallback for season ${resolvedId}`);

    const allItems: Record<string, unknown>[] = await page.evaluate(
      async (apiUrl: string) => {
        try {
          const res = await fetch(apiUrl, { credentials: 'include' });
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        } catch { return []; }
      },
      `https://www.hudl.com/api/v2/teams/${teamId}/seasons`
    );

    console.error(`[season-ctx] /api/v2 returned ${allItems.length} items`);

    // Find the season entry whose linkId matches the requested seasonId
    const seasonEntry = allItems.find(item => String(item['linkId']) === resolvedId);
    if (!seasonEntry) {
      console.error(`[season-ctx] No season entry found with linkId ${resolvedId}`);
      return { seasonId: resolvedId, uniqueGameIds: [], gameEvents: [] };
    }

    const seasonCategoryId = String(seasonEntry['categoryId'] ?? '');
    console.error(`[season-ctx] Season categoryId: ${seasonCategoryId}`);

    // Game entries for this season have parentId === seasonCategoryId
    const gameEntries = allItems.filter(
      item => String(item['parentId']) === seasonCategoryId && String(item['linkId']) !== ''
    );
    console.error(`[season-ctx] Found ${gameEntries.length} game entries for season ${resolvedId}`);

    if (gameEntries.length === 0) {
      return { seasonId: resolvedId, uniqueGameIds: [], gameEvents: [] };
    }

    // Use the game linkId values as event IDs to look up uniqueGameIds
    const gameLinkIds = gameEntries.map(g => String(g['linkId'])).filter(Boolean);
    const queryString = gameLinkIds.map(id => `eventIds=${id}`).join('&');

    const events: Record<string, unknown>[] = await page.evaluate(
      async (apiUrl: string) => {
        try {
          const res = await fetch(apiUrl, { credentials: 'include' });
          if (!res.ok) return [];
          return res.json();
        } catch { return []; }
      },
      `https://www.hudl.com/reports/teams/${teamId}/season/${resolvedId}/events?${queryString}`
    );

    if (events.length > 0) {
      console.error('[season-ctx] Event object keys:', Object.keys(events[0]).join(', '));
    }

    const uniqueGameIds = events
      .map(e => String(e['uniqueGameId'] ?? ''))
      .filter(Boolean);

    const gameEvents: GameEvent[] = events
      .filter(e => e['uniqueGameId'])
      .map(e => ({
        uniqueGameId: String(e['uniqueGameId']),
        date: String(
          e['datePlayed'] ?? e['dateScheduled'] ??
          e['eventDate'] ?? e['date'] ?? e['gameDate'] ??
          e['startDate'] ?? e['scheduledDate'] ?? ''
        ) || undefined,
      }));

    console.error(`[season-ctx] Resolved ${uniqueGameIds.length} uniqueGameIds via /api/v2 fallback`);
    return { seasonId: resolvedId, uniqueGameIds, gameEvents };
  }

  // Fetch full event objects to get uniqueGameId values + any date metadata
  const queryString = eventIds.map((id) => `eventIds=${id}`).join('&');
  const events: Record<string, unknown>[] = await page.evaluate(
    async (apiUrl: string) => {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    `https://www.hudl.com/reports/teams/${teamId}/season/${resolvedId}/events?${queryString}`
  );

  if (events.length > 0) {
    console.error('[season-ctx] Event object keys:', Object.keys(events[0]).join(', '));
    const sample = events.slice(0, 3).map(e => ({
      uniqueGameId:  e['uniqueGameId'],
      datePlayed:    e['datePlayed'],
      dateScheduled: e['dateScheduled'],
      name:          e['name'],
    }));
    console.error('[season-ctx] Sample event date values:', JSON.stringify(sample, null, 2));
  }

  const uniqueGameIds = events
    .map((e) => String(e['uniqueGameId'] ?? ''))
    .filter(Boolean);

  const gameEvents: GameEvent[] = events
    .filter(e => e['uniqueGameId'])
    .map(e => ({
      uniqueGameId: String(e['uniqueGameId']),
      date: String(
        e['datePlayed'] ?? e['dateScheduled'] ??
        e['eventDate'] ?? e['date'] ?? e['gameDate'] ??
        e['startDate'] ?? e['scheduledDate'] ?? ''
      ) || undefined,
    }));

  console.error(`[season-ctx] Resolved ${uniqueGameIds.length} uniqueGameIds`);
  console.error(`[season-ctx] Events with dates: ${gameEvents.filter(e => e.date).length} of ${gameEvents.length}`);
  return { seasonId: resolvedId, uniqueGameIds, gameEvents };
}

// ── Available seasons list ───────────────────────────────────────────────────

export interface AvailableSeason {
  seasonId: string;
  label: string;
  seasonYear: number;
}

/**
 * Return all seasons available for the team, sorted newest-first.
 *
 * Uses the authenticated Hudl API endpoint:
 *   GET /api/v2/teams/{teamId}/seasons
 * which returns an array of objects with shape { linkId, name, ... }.
 * `linkId` is the season ID used in all other report API calls.
 *
 * Falls back to redirect-URL discovery if the API call fails.
 */
export async function listAvailableSeasons(
  page: Page,
  teamId: string
): Promise<AvailableSeason[]> {
  // The API endpoint is authenticated via the browser session cookies, so we
  // call it from within the page context using fetch() with credentials.
  console.error('[seasons] Fetching season list from /api/v2/teams endpoint...');

  // We need an active page with valid session — navigate to the reports page
  // first so the authenticated session is applied, then call the API.
  await page.goto(`https://www.hudl.com/reports/teams/${teamId}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  const apiUrl = `https://www.hudl.com/api/v2/teams/${teamId}/seasons`;
  const raw = await page.evaluate(async (url: string) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }, apiUrl);

  if (!raw || !Array.isArray(raw)) {
    console.error('[seasons] API returned no data — falling back to redirect URL');
    const url = new URL(page.url());
    const seasonId = url.searchParams.get('S') ?? '';
    return seasonId
      ? [{ seasonId, label: 'Current Season', seasonYear: new Date().getFullYear() }]
      : [];
  }

  // The endpoint returns a mix of season entries AND individual game entries.
  // Season entries have a name matching the pattern "YYYY-YYYY Season"
  // (e.g. "2025-2026 Season"). Game entries have opponent-based names
  // (e.g. "vs Century High School"). We filter to seasons only.
  const SEASON_NAME_RE = /^\d{4}-\d{4}\s+Season$/i;

  const seasons: AvailableSeason[] = (raw as Record<string, unknown>[])
    .filter((item) => SEASON_NAME_RE.test(String(item['name'] ?? '')))
    .map((item) => {
      const seasonId = String(item['linkId'] ?? '');
      const label    = String(item['name']   ?? '');
      // Extract the start year from "YYYY-YYYY Season"
      const yearMatch = label.match(/^(\d{4})-\d{4}/);
      const seasonYear = yearMatch ? parseInt(yearMatch[1], 10) : 0;
      return { seasonId, label, seasonYear };
    })
    .filter((s) => s.seasonId !== '')
    .sort((a, b) => b.seasonYear - a.seasonYear); // newest first

  console.error(`[seasons] Found ${seasons.length} seasons (${seasons[seasons.length - 1]?.label} → ${seasons[0]?.label})`);
  return seasons;
}

// ── CSV download via Export button ──────────────────────────────────────────

export type ReportGrouping = 'OVERALL' | 'PLAYER' | 'GAME';
export type ReportStatType = 'TOTALS' | 'AVERAGES';

export interface ReportParams {
  grouping: ReportGrouping;
  statType: ReportStatType;
  primaryStat?: string;   // e.g. "0-Goals"
  secondaryStat?: string; // e.g. "GOALPERCENTAGE"
}

/**
 * Navigate to the Hudl stats report page, click Export, intercept the
 * download, and return the raw CSV text — no file ever touches disk.
 */
export async function fetchReportCsv(
  page: Page,
  teamId: string,
  ctx: SeasonContext,
  params: ReportParams
): Promise<string> {
  const gameParam = ctx.uniqueGameIds.join(',');
  const periods = ['WHOLEGAME', 'FIRSTHALF', 'SECONDHALF', 'Q1', 'Q2', 'Q3', 'Q4', 'OVERTIME'];

  // Hudl expects array params comma-joined in a single value (e.g. P[]=A,B,C not P[]=A&P[]=B)
  const periodsValue = periods.join(',');
  const qs = [
    `A%5B%5D=ALL`,
    `GRP=${params.grouping}`,
    gameParam ? `G%5B%5D=${encodeURIComponent(gameParam)}` : '',
    `P%5B%5D=${encodeURIComponent(periodsValue)}`,
    `Q=all-season`,
    `S=${ctx.seasonId}`,
    `SD=${teamId}`,
    `SHT%5B%5D=ALL`,
    params.secondaryStat ? `SST=${params.secondaryStat}` : '',
    `ST=${encodeURIComponent(params.primaryStat ?? '0-Goals')}`,
    `STYPE=${params.statType}`,
    `T=${teamId}`,
    `Z=ZONE`,
  ].filter(Boolean).join('&');

  const reportUrl = `https://www.hudl.com/reports/teams/${teamId}/stats?${qs}`;

  console.error(`[csv] Navigating to report: ${reportUrl}`);
  await page.goto(reportUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.error(`[csv] Landed on: ${page.url()}`);

  // Wait for Export link — its presence confirms the stats table has rendered
  const btn = page.locator('a.ActionLink', { hasText: 'Export' }).first();
  await btn.waitFor({ state: 'visible', timeout: 20000 });

  // Hudl generates the CSV client-side via a Blob + URL.createObjectURL.
  // Playwright's download event doesn't catch these, so we patch the API
  // to intercept the Blob the moment it's created, then read it as text.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>)['_hudlCsvBlob'] = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj: Blob | MediaSource): string {
      if (obj instanceof Blob) {
        (window as unknown as Record<string, unknown>)['_hudlCsvBlob'] = obj;
      }
      return orig(obj);
    };
  });

  await btn.click();
  await page.waitForTimeout(2000);

  const csv: string | null = await page.evaluate(async () => {
    const blob = (window as unknown as Record<string, unknown>)['_hudlCsvBlob'] as Blob | null;
    if (!blob) return null;
    return blob.text();
  });

  if (!csv) throw new Error('Export click did not produce a CSV blob — the page may not have finished loading stats data');

  console.error(`[csv] Captured ${csv.length} bytes of CSV data`);
  return csv;
}

// ── CSV parsing ─────────────────────────────────────────────────────────────

export type CsvRow = Record<string, string>;

/**
 * Parse a CSV string into an array of objects keyed by header row values.
 * Handles quoted fields and skips empty / section-header rows.
 */
export function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Find the first row that looks like a real header (has mostly text, not all numbers)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = splitCsvLine(lines[i]);
    const textCols = cols.filter((c) => c && isNaN(Number(c))).length;
    if (textCols >= 2) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c.trim())) continue;

    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

