const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 5;

class InMemoryStore {
  constructor() {
    this.hits = new Map();
  }

  _cleanup(now, windowMs) {
    for (const [key, entry] of this.hits.entries()) {
      if (entry.resetTime <= now) {
        this.hits.delete(key);
      }
    }
  }

  increment(key, windowMs = DEFAULT_WINDOW_MS) {
    const now = Date.now();
    this._cleanup(now, windowMs);

    const entry = this.hits.get(key);
    if (!entry) {
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { count: 1, resetTime };
    }

    entry.count += 1;
    return { count: entry.count, resetTime: entry.resetTime };
  }
}

const store = new InMemoryStore();

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX,
  keyGenerator,
} = {}) {
  return function rateLimiter(req, res, next) {
    try {
      const key =
        (typeof keyGenerator === "function"
          ? keyGenerator(req)
          : req.ip || "global") || "global";

      const { count, resetTime } = store.increment(key, windowMs);

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(max - count, 0)));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(resetTime / 1000)));

      if (count > max) {
        return res.status(429).json({
          error:
            "Trop de tentatives de connexion. Veuillez réessayer dans quelques instants.",
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

