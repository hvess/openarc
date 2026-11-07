import type { Handler } from "./router";
import { db } from "./db";
import { MAX_ORDERS_PER_MINUTE } from "./config";

const recentOrders = new Map<string, number[]>();

export const listOrders: Handler = async (req) => {
  const orders = await db.orders.forUser(req.user!.id);
  return { status: 200, body: orders };
};

export const createOrder: Handler = async (req) => {
  const userId = req.user!.id;
  const now = Date.now();
  const recent = (recentOrders.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= MAX_ORDERS_PER_MINUTE) return { status: 429 };
  recentOrders.set(userId, [...recent, now]);
  const order = await db.orders.insert(userId, req.body);
  return { status: 201, body: order };
};
