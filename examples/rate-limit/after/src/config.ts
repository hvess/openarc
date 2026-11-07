import type { Plan } from "./router";

export const PORT = 8080;
export const LIMITS: Record<Plan, { burst: number; perSecond: number }> = {
  free: { burst: 20, perSecond: 1 },
  pro: { burst: 100, perSecond: 10 },
};
