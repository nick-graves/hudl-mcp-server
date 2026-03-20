import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { HudlConfig } from './types.js';

// Load .env from the project root (same directory as this file's package.json),
// regardless of what directory Claude Desktop launches the process from.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, '..', '.env') });

export function loadConfig(): HudlConfig {
  const { HUDL_EMAIL, HUDL_PASSWORD, HUDL_TEAM_ID } = process.env;

  if (!HUDL_EMAIL || !HUDL_PASSWORD || !HUDL_TEAM_ID) {
    throw new Error(
      'Missing required environment variables. Please set HUDL_EMAIL, HUDL_PASSWORD, and HUDL_TEAM_ID.\n' +
      'Copy .env.example to .env and fill in your credentials.'
    );
  }

  return { email: HUDL_EMAIL, password: HUDL_PASSWORD, teamId: HUDL_TEAM_ID };
}
