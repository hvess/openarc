import type { Handler } from "./router";
import { db } from "./db";

export const listOrders: Handler = async (req) => {
  const orders = await db.orders.forUser(req.user!.id);
  return { status: 200, body: orders };
};

export const createOrder: Handler = async (req) => {
  const order = await db.orders.insert(req.user!.id, req.body);
  return { status: 201, body: order };
};
