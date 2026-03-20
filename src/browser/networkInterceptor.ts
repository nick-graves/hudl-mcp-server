import type { Page, Response } from 'playwright';
import type { DiscoveredEndpoint, EndpointPurpose, SessionState } from '../types.js';
import { addDiscoveredEndpoint, saveSession } from '../cache/sessionCache.js';

const ENDPOINT_PATTERNS: Array<{ pattern: RegExp; purpose: EndpointPurpose }> = [
  { pattern: /\/api\/v\d+\/teams\/[^/]+\/stats/i, purpose: 'team_stats' },
  { pattern: /\/api\/v\d+\/players\/[^/]+\/stats/i, purpose: 'player_stats' },
  { pattern: /\/api\/v\d+\/teams\/[^/]+\/games/i, purpose: 'game_results' },
  { pattern: /\/api\/v\d+\/teams\/[^/]+\/schedule/i, purpose: 'game_results' },
  { pattern: /\/api\/v\d+\/teams\/[^/]+\/roster/i, purpose: 'roster' },
  { pattern: /\/api\/v\d+\/teams\/[^/]+\/members/i, purpose: 'roster' },
  // Broader patterns as fallbacks
  { pattern: /hudl\.com\/api\/.*\/stats/i, purpose: 'team_stats' },
  { pattern: /hudl\.com\/api\/.*\/games/i, purpose: 'game_results' },
  { pattern: /hudl\.com\/api\/.*\/roster/i, purpose: 'roster' },
];

function classifyUrl(url: string): EndpointPurpose {
  for (const { pattern, purpose } of ENDPOINT_PATTERNS) {
    if (pattern.test(url)) return purpose;
  }
  return 'unknown';
}

function isApiResponse(response: Response): boolean {
  const url = response.url();
  const contentType = response.headers()['content-type'] ?? '';

  // Only capture JSON API responses from Hudl domains
  return (
    (url.includes('hudl.com') || url.includes('hudlapi.com')) &&
    contentType.includes('application/json') &&
    response.status() < 400
  );
}

export function attachInterceptor(
  page: Page,
  session: SessionState,
  onUpdate: (updated: SessionState) => void
): void {
  page.on('response', (response) => {
    if (!isApiResponse(response)) return;

    const url = response.url();
    const method = response.request().method();
    const purpose = classifyUrl(url);

    // Always log API responses for debugging
    console.error(`[intercept] ${method} ${url} → ${purpose}`);

    if (purpose !== 'unknown') {
      const endpoint: DiscoveredEndpoint = {
        url,
        method,
        purpose,
        lastSeenAt: Date.now(),
      };
      const updated = addDiscoveredEndpoint(session, endpoint);
      saveSession(updated);
      onUpdate(updated);
    }
  });
}
