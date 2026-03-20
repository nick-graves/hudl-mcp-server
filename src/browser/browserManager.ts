import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { SessionState } from '../types.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let headlessMode = true;

export function setHeadless(value: boolean): void {
  headlessMode = value;
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (context) return context;

  browser = await chromium.launch({ headless: headlessMode });
  context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  });
  return context;
}

export async function newPage(): Promise<Page> {
  const ctx = await getBrowserContext();
  return ctx.newPage();
}

export async function restoreSession(session: SessionState): Promise<void> {
  const ctx = await getBrowserContext();
  await ctx.addCookies(session.cookies as Parameters<typeof ctx.addCookies>[0]);
  console.error('[browser] Restored session cookies');
}

export async function captureSessionCookies(): Promise<SessionState['cookies']> {
  const ctx = await getBrowserContext();
  const cookies = await ctx.cookies();
  return cookies as SessionState['cookies'];
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function relaunchVisible(): Promise<void> {
  await closeBrowser();
  headlessMode = false;
  await getBrowserContext();
  console.error('[browser] Relaunched in visible mode for manual interaction');
}
