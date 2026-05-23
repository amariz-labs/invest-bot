// Idempotency store for the TradingView webhook receiver.
//
// Two implementations, one tiny interface:
//   - MemoryIdempotencyStore: LRU + TTL, single-process. Default in dev / solo.
//   - RedisIdempotencyStore:  @upstash/redis REST client. Edge-runtime-safe,
//                             survives restarts, shared across instances.
//
// `getDefaultStore()` returns Redis if `UPSTASH_REDIS_REST_URL` is set,
// otherwise the in-memory LRU. The top-level `wasProcessed` / `markProcessed`
// exports stay backward-compatible with the existing webhook route — they
// just delegate to `getDefaultStore()`.

import { LRUCache } from "lru-cache";

// ---------------------------------------------------------------------------

export interface IdempotencyStore {
  wasProcessed(key: string): Promise<boolean>;
  markProcessed(key: string, ttlSec: number): Promise<void>;
}

// ---------------------------------------------------------------------------

const KEY_PREFIX = "tv:";

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly cache: LRUCache<string, true>;

  constructor(opts?: { max?: number; defaultTtlMs?: number }) {
    this.cache = new LRUCache<string, true>({
      max: opts?.max ?? 5_000,
      ttl: opts?.defaultTtlMs ?? 60 * 60 * 1000, // 1h
    });
  }

  async wasProcessed(key: string): Promise<boolean> {
    return this.cache.has(KEY_PREFIX + key);
  }

  async markProcessed(key: string, ttlSec: number): Promise<void> {
    this.cache.set(KEY_PREFIX + key, true, { ttl: ttlSec * 1000 });
  }
}

// ---------------------------------------------------------------------------

export interface RedisIdempotencyConfig {
  url: string;
  token: string;
}

// We import the Upstash type lazily to keep the dep optional at compile time
// for environments that haven't installed it yet. The runtime import in the
// constructor guarantees the package is present before any call is made.
interface UpstashRedisLike {
  set(
    key: string,
    value: string,
    opts: { nx?: true; ex?: number },
  ): Promise<unknown>;
  exists(key: string): Promise<number>;
}

export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly cfg: RedisIdempotencyConfig;
  private clientP: Promise<UpstashRedisLike> | null = null;

  constructor(cfg: RedisIdempotencyConfig) {
    if (!cfg.url || !cfg.token) {
      throw new Error("RedisIdempotencyStore: url and token are required");
    }
    this.cfg = cfg;
  }

  // Lazy ESM dynamic import — `@upstash/redis` is an optional dep at runtime.
  // The original `require("@upstash/redis")` crashed in ESM/NodeNext builds
  // ("require is not defined"); dynamic `import()` works under both moduleResolution
  // settings and lets us defer the load until the first call.
  private getClient(): Promise<UpstashRedisLike> {
    if (!this.clientP) {
      this.clientP = import("@upstash/redis").then((mod) => {
        const Ctor = (mod as { Redis: new (cfg: RedisIdempotencyConfig) => UpstashRedisLike }).Redis;
        return new Ctor({ url: this.cfg.url, token: this.cfg.token });
      });
    }
    return this.clientP;
  }

  async wasProcessed(key: string): Promise<boolean> {
    const client = await this.getClient();
    const n = await client.exists(KEY_PREFIX + key);
    return n > 0;
  }

  async markProcessed(key: string, ttlSec: number): Promise<void> {
    // SETNX + EXPIRE atomically: Upstash supports the `nx` + `ex` flags on
    // the single SET command, so this is one round-trip with the natural
    // "only set if absent" semantics we want for idempotency.
    const client = await this.getClient();
    await client.set(KEY_PREFIX + key, "1", { nx: true, ex: ttlSec });
  }
}

// ---------------------------------------------------------------------------

let _default: IdempotencyStore | null = null;

/**
 * Lazily construct (and memoize) the default store. Picks Redis when
 * `UPSTASH_REDIS_REST_URL` is present, otherwise the in-memory LRU.
 *
 * Exported separately so tests can call `__resetDefaultStore()` between
 * runs, and so callers that want to inject their own store can bypass it.
 */
export function getDefaultStore(): IdempotencyStore {
  if (_default) return _default;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _default = new RedisIdempotencyStore({ url, token });
  } else {
    _default = new MemoryIdempotencyStore();
  }
  return _default;
}

/** Test seam: forget the cached default store. */
export function __resetDefaultStore(): void {
  _default = null;
}

// ---------------------------------------------------------------------------
// Backward-compatible top-level functions. The existing
// `app/api/tv-webhook/route.ts` imports these directly — DO NOT remove or
// rename without updating that route.

export function wasProcessed(key: string): Promise<boolean> {
  return getDefaultStore().wasProcessed(key);
}

export function markProcessed(key: string, ttlSeconds = 3_600): Promise<void> {
  return getDefaultStore().markProcessed(key, ttlSeconds);
}
