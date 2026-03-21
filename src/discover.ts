/**
 * Standalone season-discovery script — Phase 1 probe.
 * Run:  npm run discover
 *
 * Authenticates with Hudl, probes all candidate season-list endpoints,
 * and writes the full results to discovery-results.json in the project root.
 * Nothing interactive — just run it and check the output file.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from './config.js';
import { loadSession, saveSession } from './cache/sessionCache.js';
import { ensureAuthenticated } from './auth/hudlAuth.js';
import { closeBrowser } from './browser/browserManager.js';
import { listAvailableSeasons } from './fetchers/reportsCsvFetcher.js';

async function main(): Promise<void> {
  console.error('[discover] Loading config...');
  const config = loadConfig();
  const session = loadSession();

  console.error('[discover] Authenticating...');
  const { page, session: freshSession } = await ensureAuthenticated(session, config);
  saveSession(freshSession);

  console.error('[discover] Reading available seasons from window.__hudlEmbed...');
  const seasons = await listAvailableSeasons(page, config.teamId);

  // Write full results to file
  const outputPath = resolve(process.cwd(), 'discovery-results.json');
  const output = {
    timestamp: new Date().toISOString(),
    teamId: config.teamId,
    totalSeasons: seasons.length,
    seasons,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.error(`\n[discover] Done! Results written to:\n  ${outputPath}`);
  console.error(`[discover] Seasons found: ${seasons.length}`);
  seasons.forEach((s) => {
    console.error(`  - ${s.seasonId}  "${s.label}"  (${s.seasonYear})`);
  });

  await closeBrowser();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
