import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { config } from "./config.js";
import { NotAProblemError } from "./engine/analyze.js";
import { NoApiKeyError } from "./providers/index.js";
import { activeProvider, warnIfNoApiKey } from "./providers/state.js";
import { NotFoundError } from "./engine/tutorEngine.js";
import { logger } from "./lib/logger.js";
import { registerConfigRoutes } from "./routes/config.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProblemRoutes } from "./routes/problems.js";
import { registerSessionRoutes } from "./routes/sessions.js";

// 没有 Key 不再退出进程 —— 否则首页「接入 AI 模型」那个页面根本打不开
warnIfNoApiKey();

const app = Fastify({
  logger: false,
  bodyLimit: 25 * 1024 * 1024,
});

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

registerHealthRoutes(app);
registerConfigRoutes(app);
registerProblemRoutes(app);
registerSessionRoutes(app);

app.setNotFoundHandler((_req, reply) => {
  reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: "接口不存在" } });
});

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof NotFoundError) {
    return reply
      .code(404)
      .send({ ok: false, error: { code: "NOT_FOUND", message: error.message } });
  }
  if (error instanceof NotAProblemError) {
    return reply
      .code(422)
      .send({ ok: false, error: { code: "NOT_A_PROBLEM", message: error.message } });
  }

  // 走到这里的是未预期错误：日志留全，返回给客户端的只保留可读信息
  const err = error as Error & { statusCode?: number };
  logger.error("未捕获错误", { message: err.message, stack: err.stack });
  const status = err.statusCode ?? 500;
  return reply.code(status).send({
    ok: false,
    error: { code: "INTERNAL", message: err.message || "服务器内部错误" },
  });
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`解题伙伴后端已启动 http://localhost:${config.PORT}（provider=${activeProvider()}）`);
} catch (err) {
  logger.error("启动失败", { message: (err as Error).message });
  process.exit(1);
}
