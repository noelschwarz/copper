import { VERSION } from "aloy";
import { Hono } from "hono";

export function buildHealthRoute(): Hono {
  const app = new Hono();
  app.get("/", (c) => c.json({ status: "ok", version: VERSION }));
  return app;
}
