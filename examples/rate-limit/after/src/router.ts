export type Plan = "free" | "pro";
export type User = { id: string; plan: Plan };
export type Request = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  user?: User;
};
export type Response = { status: number; body?: unknown; headers?: Record<string, string> };
export type Handler = (req: Request) => Promise<Response>;
export type Middleware = (req: Request, next: Handler) => Promise<Response>;

export class Router {
  private middleware: Middleware[] = [];
  private routes = new Map<string, Handler>();

  use(mw: Middleware): void {
    this.middleware.push(mw);
  }

  get(path: string, handler: Handler): void {
    this.routes.set(`GET ${path}`, handler);
  }

  post(path: string, handler: Handler): void {
    this.routes.set(`POST ${path}`, handler);
  }

  async handle(req: Request): Promise<Response> {
    const route = this.routes.get(`${req.method} ${req.path}`);
    if (!route) return { status: 404 };
    const chain = this.middleware.reduceRight<Handler>((next, mw) => (r) => mw(r, next), route);
    return chain(req);
  }
}
