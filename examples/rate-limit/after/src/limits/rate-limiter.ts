import type { Clock } from "../clock";
import type { Plan } from "../router";
import { LIMITS } from "../config";
import { TokenBucket } from "./token-bucket";

export type Decision = { allowed: true } | { allowed: false; retryAfter: number };

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  constructor(private clock: Clock) {}

  check(clientId: string, plan: Plan): Decision {
    const now = this.clock.now();
    const bucket = this.bucketFor(clientId, plan, now);
    bucket.refill(now);
    if (bucket.tryTake()) return { allowed: true };
    return { allowed: false, retryAfter: Math.ceil(bucket.secondsUntilNext()) };
  }

  private bucketFor(clientId: string, plan: Plan, now: number): TokenBucket {
    let bucket = this.buckets.get(clientId);
    if (!bucket) {
      const { burst, perSecond } = LIMITS[plan];
      bucket = new TokenBucket(burst, perSecond, now);
      this.buckets.set(clientId, bucket);
    }
    return bucket;
  }
}
