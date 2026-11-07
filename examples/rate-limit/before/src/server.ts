import { Router } from "./router";
import { requireAuth } from "./auth";
import { listOrders, createOrder } from "./orders";

export function buildServer(): Router {
  const router = new Router();
  router.use(requireAuth);
  router.get("/orders", listOrders);
  router.post("/orders", createOrder);
  return router;
}
