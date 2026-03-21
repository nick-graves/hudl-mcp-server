// Temporary script — fetch 2018-2019 season stats directly
import { loadConfig } from './dist/config.js';
import { loadSession, saveSession } from './dist/cache/sessionCache.js';
import { ensureAuthenticated } from './dist/auth/hudlAuth.js';
import { scrapePlayerStats } from './dist/scrapers/playerStatsScraper.js';
import { scrapeTeamStats } from './dist/scrapers/teamStatsScraper.js';
import { scrapeGameResults } from './dist/scrapers/gameResultsScraper.js';
import { closeBrowser } from './dist/browser/browserManager.js';

const SEASON_ID = '936742'; // 2018-2019 Season

const config = loadConfig();
const session = loadSession();
const { page, session: freshSession } = await ensureAuthenticated(session, config);
saveSession(freshSession);

const teamStats   = await scrapeTeamStats(page, freshSession, config.teamId, saveSession, SEASON_ID);
const playerStats = await scrapePlayerStats(page, freshSession, config.teamId, saveSession, undefined, SEASON_ID);

process.stdout.write(JSON.stringify({ teamStats, playerStats }, null, 2) + '\n');
await closeBrowser();
process.exit(0);
