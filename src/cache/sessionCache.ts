import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { SessionState, DiscoveredEndpoint, EndpointPurpose } from '../types.js';

const SESSION_FILE = resolve(process.cwd(), '.hudl-session.json');
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function loadSession(): SessionState | null {
  try {
    if (!existsSync(SESSION_FILE)) return null;
    const raw = readFileSync(SESSION_FILE, 'utf-8');
    const state = JSON.parse(raw) as SessionState;
    if (isExpired(state)) {
      console.error('[session] Cached session expired, will re-authenticate');
      return null;
    }
    console.error('[session] Loaded valid cached session');
    return state;
  } catch {
    return null;
  }
}

export function saveSession(state: SessionState): void {
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2), 'utf-8');
    console.error('[session] Session saved to disk');
  } catch (err) {
    console.error('[session] Failed to save session:', err);
  }
}

export function isExpired(state: SessionState): boolean {
  return Date.now() - state.capturedAt > SESSION_TTL_MS;
}

export function addDiscoveredEndpoint(
  state: SessionState,
  endpoint: DiscoveredEndpoint
): SessionState {
  const existing = state.discoveredEndpoints.findIndex(
    (e) => e.url === endpoint.url && e.method === endpoint.method
  );
  const updated = [...state.discoveredEndpoints];
  if (existing >= 0) {
    updated[existing] = { ...updated[existing], lastSeenAt: Date.now() };
  } else {
    updated.push(endpoint);
  }
  return { ...state, discoveredEndpoints: updated };
}

export function findEndpoint(
  state: SessionState,
  purpose: EndpointPurpose
): DiscoveredEndpoint | undefined {
  return state.discoveredEndpoints.find((e) => e.purpose === purpose);
}
