import { loadConfig }                from './config.js';
import { loadSession, saveSession }  from './cache/sessionCache.js';
import { ensureAuthenticated }       from './auth/hudlAuth.js';
import { scrapeGameResults }         from './scrapers/gameResultsScraper.js';
import { writeFileSync }             from 'fs';

const SEASONS = [
  { id: '2253520', label: '2023-2024' },
  { id: '1955514', label: '2022-2023' },
];

async function main() {
  const config  = loadConfig();
  let   session = loadSession();

  for (const { id, label } of SEASONS) {
    console.error(`\nFetching game results for ${label} (${id})...`);
    const { page, session: s } = await ensureAuthenticated(session, config);
    session = s;
    const games = await scrapeGameResults(page, session, config.teamId, saveSession, undefined, id);
    const outFile = `game-results-${label}.json`;
    writeFileSync(outFile, JSON.stringify(games, null, 2));
    console.error(`Wrote ${games.length} games → ${outFile}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
