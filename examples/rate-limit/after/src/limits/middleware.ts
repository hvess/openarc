import type { Middleware } from "../router";
import type { RateLimiter } from "./rate-limiter";

export function rateLimit(limiter: RateLimiter): Middleware {
  return async (req, next) => {
    const user = req.user;
    if (!user) return next(req);
    const decision = limiter.check(user.id, user.plan);
    if (!decision.allowed) {
      return { status: 429, headers: { "retry-after": String(decision.retryAfter) } };
    }
    return next(req);
  };
}
