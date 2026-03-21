import type { Page } from 'playwright';

// ── Season / game ID discovery ─────────────────────────────────────────────

export interface SeasonContext {
  seasonId: string;
  uniqueGameIds: string[]; // e.g. ["32839303-a1b3", "32853727-bc42"]
}

/**
 * Navigate to the reports page, let it redirect, and extract the current
 * season ID + game IDs from the URL and Hudl's internal APIs.
 */
export async function getSeasonContext(
  page: Page,
  teamId: string
): Promise<SeasonContext> {
  await page.goto(`https://www.hudl.com/reports/teams/${teamId}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // Extract season ID from redirected URL (?S=...)
  const url = new URL(page.url());
  const seasonId = url.searchParams.get('S') ?? '';
  if (!seasonId) throw new Error('Could not determine current season ID from reports redirect');

  // Fetch event IDs for this season
  const eventIds: string[] = await page.evaluate(
    async (apiUrl: string) => {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    `https://www.hudl.com/reports/teams/${teamId}/season/${seasonId}/eventids`
  );

  if (eventIds.length === 0) {
    return { seasonId, uniqueGameIds: [] };
  }

  // Fetch full event objects to get uniqueGameId values
  const queryString = eventIds.map((id) => `eventIds=${id}`).join('&');
  const events: { uniqueGameId?: string }[] = await page.evaluate(
    async (apiUrl: string) => {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    `https://www.hudl.com/reports/teams/${teamId}/season/${seasonId}/events?${queryString}`
  );

  const uniqueGameIds = events
    .map((e) => e.uniqueGameId)
    .filter((id): id is string => !!id);

  return { seasonId, uniqueGameIds };
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

