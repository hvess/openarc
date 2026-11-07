export const db = {
  orders: {
    async forUser(userId: string): Promise<unknown[]> {
      return [];
    },
    async insert(userId: string, order: unknown): Promise<unknown> {
      return { id: crypto.randomUUID(), userId, ...(order as object) };
    },
  },
};
