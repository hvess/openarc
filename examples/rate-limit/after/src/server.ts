import { Router } from "./router";
import { requireAuth } from "./auth";
import { listOrders, createOrder } from "./orders";
import { type Clock, systemClock } from "./clock";
import { RateLimiter } from "./limits/rate-limiter";
import { rateLimit } from "./limits/middleware";

export function buildServer(clock: Clock = systemClock): Router {
  const router = new Router();
  const limiter = new RateLimiter(clock);
  router.use(requireAuth);
  router.use(rateLimit(limiter));
  router.get("/orders", listOrders);
  router.post("/orders", createOrder);
  return router;
}
