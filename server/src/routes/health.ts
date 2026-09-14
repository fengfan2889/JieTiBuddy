import type { FastifyInstance } from "fastify";

import { activeProvider } from "../providers/state.js";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/api/health", async () => ({
    ok: true,
    data: {
      status: "up",
      provider: activeProvider(),
      time: Date.now(),
    },
  }));
}
