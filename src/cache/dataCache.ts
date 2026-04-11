import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ── TTL constants (milliseconds) ───────────────────────────────────────────────
export const TTL = {
  /** Completed game — stats are final, never expire automatically. */
  GAME_PERMANENT: 0,
  /** Completed prior season — all stats are final, never expire. */
  SEASON_PERMANENT: 0,
  /** Season-accumulating data — refresh daily during active season. */
  SEASON_24H: 24 * 60 * 60 * 1000,
} as const;

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;   // epoch ms
  ttl: number;        // ms; 0 = no expiry
  key: string;        // human-readable label stored for diagnostics
}

// ── DataCache ──────────────────────────────────────────────────────────────────

export class DataCache {
  private readonly dir: string;

  constructor(cacheDir?: string) {
    this.dir = cacheDir ?? path.join(process.cwd(), '.cache');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get<T>(key: string): T | null {
    const file = this._file(key);
    if (!fs.existsSync(file)) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this._isExpired(entry)) {
        fs.unlinkSync(file);
        console.error(`[cache] Expired — deleted: ${entry.key}`);
        return null;
      }
      console.error(`[cache] HIT: ${entry.key}`);
      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, label: string, data: T, ttl: number): void {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now(), ttl, key: label };
    fs.writeFileSync(this._file(key), JSON.stringify(entry, null, 2), 'utf8');
    console.error(`[cache] SET: ${label}`);
  }

  /**
   * Invalidate cache entries.
   *
   * @param scope  "all" clears everything; a raw key string deletes that one file.
   * @returns      Number of files deleted.
   */
  invalidate(scope: string): number {
    if (scope === 'all') {
      const files = this._files();
      files.forEach(f => fs.unlinkSync(path.join(this.dir, f)));
      console.error(`[cache] Cleared ${files.length} entries (all)`);
      return files.length;
    }

    const file = this._file(scope);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.error(`[cache] Cleared: ${scope}`);
      return 1;
    }
    return 0;
  }

  /**
   * Delete all entries whose stored key label contains the given substring.
   * Used for "clear everything for season 2024-2025" or "clear Oregon City".
   */
  invalidateMatching(substring: string): number {
    const files = this._files();
    let count = 0;
    for (const f of files) {
      try {
        const entry: CacheEntry<unknown> = JSON.parse(
          fs.readFileSync(path.join(this.dir, f), 'utf8')
        );
        if (entry.key.toLowerCase().includes(substring.toLowerCase())) {
          fs.unlinkSync(path.join(this.dir, f));
          console.error(`[cache] Cleared matching "${substring}": ${entry.key}`);
          count++;
        }
      } catch {
        // skip corrupt files
      }
    }
    return count;
  }

  /** List all cache entries with their metadata (for diagnostics). */
  list(): Array<{ key: string; cachedAt: string; ttl: string; expired: boolean }> {
    return this._files().map(f => {
      try {
        const entry: CacheEntry<unknown> = JSON.parse(
          fs.readFileSync(path.join(this.dir, f), 'utf8')
        );
        const expired = this._isExpired(entry);
        const ttlLabel = entry.ttl === 0 ? 'permanent' : `${entry.ttl / 3600000}h`;
        return {
          key: entry.key,
          cachedAt: new Date(entry.cachedAt).toLocaleString(),
          ttl: ttlLabel,
          expired,
        };
      } catch {
        return { key: f, cachedAt: '?', ttl: '?', expired: false };
      }
    });
  }

  /** Return all entries including full data payload — used for cache inspect. */
  listAll(): Array<{ index: number; key: string; cachedAt: string; ttl: string; expired: boolean; data: unknown }> {
    return this._files().map((f, i) => {
      try {
        const entry: CacheEntry<unknown> = JSON.parse(
          fs.readFileSync(path.join(this.dir, f), 'utf8')
        );
        const expired = this._isExpired(entry);
        const ttlLabel = entry.ttl === 0 ? 'permanent' : `${entry.ttl / 3600000}h`;
        return { index: i, key: entry.key, cachedAt: new Date(entry.cachedAt).toLocaleString(), ttl: ttlLabel, expired, data: entry.data };
      } catch {
        return { index: i, key: f, cachedAt: '?', ttl: '?', expired: false, data: null };
      }
    });
  }

  /** Return the cache directory path. */
  getDir(): string { return this.dir; }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _file(key: string): string {
    const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
    return path.join(this.dir, `${hash}.json`);
  }

  private _files(): string[] {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
  }

  private _isExpired<T>(entry: CacheEntry<T>): boolean {
    if (entry.ttl === 0) return false;
    return Date.now() - entry.cachedAt > entry.ttl;
  }
}
