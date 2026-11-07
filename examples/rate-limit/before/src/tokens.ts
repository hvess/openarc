import type { User } from "./router";

export async function verifyToken(token: string): Promise<User | null> {
  const res = await fetch("https://auth.internal/verify", { method: "POST", body: token });
  return res.ok ? ((await res.json()) as User) : null;
}
