import type { Page } from 'playwright';
import type { HudlConfig, SessionState } from '../types.js';
import {
  newPage,
  restoreSession,
  captureSessionCookies,
  relaunchVisible,
} from '../browser/browserManager.js';
import { saveSession } from '../cache/sessionCache.js';

const LOGIN_URL = 'https://www.hudl.com/login';
const DASHBOARD_URL_PATTERN = /hudl\.com\/(home|app|dashboard)/;

export async function ensureAuthenticated(
  session: SessionState | null,
  config: HudlConfig
): Promise<{ page: Page; session: SessionState }> {
  const page = await newPage();

  // Try to restore a cached session first
  if (session) {
    await restoreSession(session);
    await page.goto('https://www.hudl.com/home', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    if (DASHBOARD_URL_PATTERN.test(page.url())) {
      console.error('[auth] Cached session is valid, skipping login');
      return { page, session };
    }
    console.error('[auth] Cached session invalid, proceeding with login');
  }

  // Perform fresh login
  const freshSession = await performLogin(page, config);
  return { page, session: freshSession };
}

async function performLogin(page: Page, config: HudlConfig): Promise<SessionState> {
  console.error('[auth] Navigating to Hudl login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

  // Step 1: Fill username and click Continue
  const emailInput = page.locator('input[name="username"], input[id="username"], input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(config.email);

  const continueButton = page.locator('button[type="submit"], input[type="submit"]').first();
  await continueButton.click();

  // Step 2: Wait for password field to become visible (two-step login)
  const passwordInput = page.locator('input[type="password"]:not([aria-hidden="true"])').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput.fill(config.password);

  // Submit password
  const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
  await submitButton.click();

  // Wait for navigation after login
  await page.waitForTimeout(3000);

  // Check for 2FA / CAPTCHA
  const needs2FA = await detect2FA(page);
  if (needs2FA) {
    console.error('[auth] 2FA or CAPTCHA detected — relaunching browser in visible mode');
    console.error('[auth] Please complete the verification in the browser window, then wait...');
    await relaunchVisible();

    // Re-navigate to login on the now-visible browser
    const visiblePage = await newPage();
    await visiblePage.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    const visibleEmail = visiblePage.locator('input[name="username"], input[id="username"], input[type="email"], input[name="email"]').first();
    await visibleEmail.fill(config.email);
    const visibleContinue = visiblePage.locator('button[type="submit"]').first();
    await visibleContinue.click();
    const visiblePass = visiblePage.locator('input[type="password"]:not([aria-hidden="true"])').first();
    await visiblePass.waitFor({ state: 'visible', timeout: 10000 });
    await visiblePass.fill(config.password);
    const visibleSubmit = visiblePage.locator('button[type="submit"]').first();
    await visibleSubmit.click();

    // Wait up to 2 minutes for the user to complete 2FA manually
    await visiblePage.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 120000 });
    console.error('[auth] Manual 2FA completed, capturing session');

    const cookies = await captureSessionCookies();
    const newSession: SessionState = {
      cookies,
      discoveredEndpoints: [],
      capturedAt: Date.now(),
    };
    saveSession(newSession);
    return newSession;
  }

  // Check if login succeeded
  await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 15000 }).catch(async () => {
    // May have redirected to team page or similar — just check we're not on login
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      throw new Error(
        'Login failed — still on login page. Check your HUDL_EMAIL and HUDL_PASSWORD in .env'
      );
    }
  });

  console.error('[auth] Login successful, capturing session');
  const cookies = await captureSessionCookies();
  const newSession: SessionState = {
    cookies,
    discoveredEndpoints: [],
    capturedAt: Date.now(),
  };
  saveSession(newSession);
  return newSession;
}

async function detect2FA(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('two-factor') || url.includes('2fa') || url.includes('verify')) return true;

  const otpInput = await page.$('input[name="otp"], input[name="code"], input[autocomplete="one-time-code"]');
  if (otpInput) return true;

  const captchaFrame = await page.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
  if (captchaFrame) return true;

  return false;
}
