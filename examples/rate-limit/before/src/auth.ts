import type { Middleware } from "./router";
import { verifyToken } from "./tokens";

export const requireAuth: Middleware = async (req, next) => {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) return { status: 401 };
  const user = await verifyToken(header.slice(7));
  if (!user) return { status: 401 };
  req.user = user;
  return next(req);
};
