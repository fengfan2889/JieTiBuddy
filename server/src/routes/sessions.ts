import type { QuickAction, SendMessageRequest, SessionMode } from "../shared.js";
import { QUICK_ACTION_LABEL } from "../shared.js";

import type { FastifyInstance, FastifyReply } from "fastify";

import {
  createSession,
  deleteSession,
  getProblem,
  getSession,
  listMessages,
  listSessions,
} from "../db/repo.js";
import { directTurn } from "../engine/direct.js";
import { buildGuideMap } from "../engine/plan.js";
import { finalizeSession } from "../engine/summarize.js";
import { startTurn, studentTurn } from "../engine/tutorEngine.js";
import type { TurnResult } from "../engine/tutorEngine.js";
import { logger } from "../lib/logger.js";

const VALID_ACTIONS = new Set<QuickAction>([
  "MORE_DETAIL",
  "ASK_WHY",
  "EXPLAIN_THIS_STEP",
  "SWITCH_ROUTE",
  "SHOW_ANSWER",
]);

export function registerSessionRoutes(app: FastifyInstance): void {
  /** 创建解题会话。guide 模式会先做一次「分析前置」，产出引导地图再返回。 */
  app.post<{ Body: { problemId?: string; mode?: SessionMode } }>(
    "/api/sessions",
    async (req, reply) => {
      const { problemId, mode } = req.body ?? {};
      if (!problemId || (mode !== "guide" && mode !== "direct")) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "需要 problemId 与 mode(guide|direct)" },
        });
      }

      const problem = getProblem(problemId);
      if (!problem) {
        return reply
          .code(404)
          .send({ ok: false, error: { code: "NOT_FOUND", message: "题目不存在" } });
      }

      let guideMap = null;
      let internalAnswer: string | null = null;

      if (mode === "guide") {
        const plan = await buildGuideMap(problem);
        guideMap = plan.guideMap;
        internalAnswer = plan.answer;
        logger.info("引导地图已生成", {
          problemId,
          steps: plan.guideMap.steps.length,
          altRoutes: plan.guideMap.altRoutes.length,
          firstAttemptIssue: plan.firstAttemptIssue,
        });
      }

      const session = createSession({ problemId, mode, guideMap, internalAnswer });
      return { ok: true, data: { session } };
    },
  );

  app.get("/api/sessions", async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(50, Number(q.limit ?? 20) || 20);
    const offset = Math.max(0, Number(q.offset ?? 0) || 0);
    return { ok: true, data: { sessions: listSessions(limit, offset) } };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) {
      return reply
        .code(404)
        .send({ ok: false, error: { code: "NOT_FOUND", message: "会话不存在" } });
    }
    return { ok: true, data: { session, messages: listMessages(req.params.id) } };
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req) => {
    deleteSession(req.params.id);
    return { ok: true, data: { deleted: true } };
  });

  /**
   * 首轮（SSE）。
   * guide  → 路径预告 + 迈出第一步
   * direct → 直接给出答案与完整解析，没有引导语
   */
  app.post<{ Params: { id: string } }>("/api/sessions/:id/start", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) return notFoundSession(reply);

    await streamTurn(reply, () =>
      session.mode === "direct" ? directTurn(session.id, null) : startTurn(session.id),
    );
  });

  /** 学生说了一句（SSE） */
  app.post<{ Params: { id: string }; Body: SendMessageRequest }>(
    "/api/sessions/:id/messages",
    async (req, reply) => {
      const body = req.body ?? { content: "" };
      const content = (body.content ?? "").trim();
      const action = body.action && VALID_ACTIONS.has(body.action) ? body.action : undefined;

      if (!content && !action) {
        return reply.code(400).send({
          ok: false,
          error: { code: "EMPTY_MESSAGE", message: "消息内容不能为空" },
        });
      }

      const session = getSession(req.params.id);
      if (!session) return notFoundSession(reply);

      // 直接模式：追问也走「直接回答」，不进入引导链路
      if (session.mode === "direct") {
        if (!content) return modeNotSupported(reply);
        await streamTurn(reply, () => directTurn(session.id, content));
        return;
      }

      await streamTurn(reply, () => studentTurn(session.id, content, action));
    },
  );

  /** 快捷按钮：等价于学生说了那句话 */
  app.post<{ Params: { id: string }; Body: { action?: QuickAction } }>(
    "/api/sessions/:id/hint",
    async (req, reply) => {
      const action = req.body?.action;
      if (!action || !VALID_ACTIONS.has(action)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_ACTION", message: "不支持的快捷动作" },
        });
      }

      const session = getSession(req.params.id);
      if (!session) return notFoundSession(reply);
      if (session.mode === "direct") return modeNotSupported(reply);

      if (action === "SHOW_ANSWER") {
        // 看完整解析 = 直接走收尾，不占用对话轮
        const text = await finalizeSession(req.params.id);
        return { ok: true, data: { text, isSolved: true } };
      }
      await streamTurn(reply, () => studentTurn(session.id, QUICK_ACTION_LABEL[action], action));
    },
  );

  /** 收尾：完整解析 + 知识点 + 易错点 */
  app.post<{ Params: { id: string } }>("/api/sessions/:id/finalize", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) return notFoundSession(reply);
    // 直接模式首轮就已给出答案与解析，没有可复盘的对话过程
    if (session.mode === "direct") return modeNotSupported(reply);

    const text = await finalizeSession(session.id);
    return { ok: true, data: { text, isSolved: true } };
  });
}

// ---------- SSE ----------

function notFoundSession(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: "会话不存在" } });
}

function modeNotSupported(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    ok: false,
    error: {
      code: "MODE_NOT_SUPPORTED",
      message: "这是「直接看答案」的会话，没有引导动作。想被引导请重新选「引导我解」。",
    },
  });
}

/**
 * 先完整生成 + 校验，再按块推给前端。
 *
 * 不是真流式，是刻意的：空泛话术必须在发出前拦下重写。
 * 前端体验上用分块推送 + 打字机效果补回来。
 */
async function streamTurn(reply: FastifyReply, produce: () => Promise<TurnResult>): Promise<void> {
  const result = await produce();

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  send(res, "meta", result.meta);

  for (const chunk of chunkText(result.text)) {
    send(res, "delta", { text: chunk });
    await sleep(12);
  }

  send(res, "done", {
    messageId: result.messageId,
    isSolved: result.isSolved,
    degraded: result.degraded,
  });
  res.end();
}

function send(res: NodeJS.WritableStream, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function chunkText(text: string, size = 22): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
