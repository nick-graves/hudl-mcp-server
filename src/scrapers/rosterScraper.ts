import type { Page } from 'playwright';
import type { RosterPlayer, SessionState } from '../types.js';
import { attachInterceptor } from '../browser/networkInterceptor.js';

export async function scrapeRoster(
  page: Page,
  session: SessionState,
  teamId: string,
  onSessionUpdate: (s: SessionState) => void
): Promise<RosterPlayer[]> {
  attachInterceptor(page, session, onSessionUpdate);

  await page.goto(`https://www.hudl.com/teams/${teamId}/manage`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });

  // Wait for the ReactVirtualized table to render
  await page.waitForSelector('div[role="row"][aria-label="row"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ReactVirtualized only renders visible rows — scroll to load all of them
  const players = await scrollAndExtractAllRows(page);
  return players;
}

async function scrollAndExtractAllRows(page: Page): Promise<RosterPlayer[]> {
  const seen = new Map<string, RosterPlayer>();

  const tableContainer = page.locator('.ReactVirtualized__Table__Grid').first();
  const exists = await tableContainer.count();
  if (!exists) return [];

  // Get total scroll height
  const scrollHeight = await tableContainer.evaluate((el) => el.scrollHeight);
  const clientHeight = await tableContainer.evaluate((el) => el.clientHeight);
  const rowHeight = 40;
  const totalRows = Math.ceil(scrollHeight / rowHeight);

  // Scroll in steps to force all rows to render
  for (let scrollTop = 0; scrollTop <= scrollHeight; scrollTop += clientHeight - rowHeight) {
    await tableContainer.evaluate((el, top) => el.scrollTo(0, top), scrollTop);
    await page.waitForTimeout(300);

    const rows = await extractVisibleRows(page);
    for (const row of rows) {
      if (!seen.has(row.playerId)) {
        seen.set(row.playerId, row);
      }
    }

    if (seen.size >= totalRows) break;
  }

  return Array.from(seen.values()).filter((p) => p.name && p.name !== 'Unknown');
}

async function extractVisibleRows(page: Page): Promise<RosterPlayer[]> {
  return page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll('div[role="row"][aria-label="row"]')
    );

    return rows.map((row) => {
      // data-qa-id="FirstName-LastName-Jersey"
      const qaId = row.querySelector('[data-qa-id]')?.getAttribute('data-qa-id') ?? '';
      const parts = qaId.split('-');

      const cols = Array.from(
        row.querySelectorAll('.ReactVirtualized__Table__rowColumn')
      ).map((c) => (c as HTMLElement).title || c.textContent?.trim() || '');

      // Columns: [checkbox, jersey, firstName, lastName, role, gradYear, position, ...]
      const jersey = cols[1] ?? '';
      const firstName = cols[2] ?? '';
      const lastName = cols[3] ?? '';
      const gradYear = cols[5] ?? '';
      const position = cols[6] ?? '';

      const name = firstName && lastName ? `${firstName} ${lastName}` : parts.slice(0, -1).join(' ');
      const playerId = qaId || `${name}-${jersey}`;

      return { playerId, name, number: jersey, position, grade: gradYear, raw: {} };
    });
  });
}
