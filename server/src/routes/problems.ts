import { SUBJECTS } from "../shared.js";
import type { Subject } from "../shared.js";

import type { FastifyInstance } from "fastify";

import { createProblem, getProblem, updateProblem } from "../db/repo.js";
import { saveImage } from "../lib/image.js";
import { analyzeImage } from "../engine/analyze.js";

export function registerProblemRoutes(app: FastifyInstance): void {
  /** 上传题目图片 → 立刻识别（VL 模型） */
  app.post("/api/problems", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ ok: false, error: { code: "NO_FILE", message: "没有收到图片" } });
    }

    const buffer = await file.toBuffer();
    if (buffer.length === 0) {
      return reply
        .code(400)
        .send({ ok: false, error: { code: "EMPTY_FILE", message: "图片内容为空" } });
    }

    const saved = await saveImage(buffer, file.mimetype);
    const analysis = await analyzeImage(saved.dataUrl);

    const problem = createProblem({
      imagePath: saved.relativePath,
      ocrText: analysis.ocrText,
      ocrLatex: analysis.ocrLatex,
      ocrConfidence: analysis.ocrConfidence,
      subject: analysis.subject,
      gradeHint: analysis.gradeHint,
      difficulty: analysis.difficulty,
      knowledgePoints: analysis.knowledgePoints,
    });

    return { ok: true, data: { problem } };
  });

  app.get<{ Params: { id: string } }>("/api/problems/:id", async (req, reply) => {
    const problem = getProblem(req.params.id);
    if (!problem) {
      return reply
        .code(404)
        .send({ ok: false, error: { code: "NOT_FOUND", message: "题目不存在" } });
    }
    return { ok: true, data: { problem } };
  });

  /** 学生手动修正识别结果 */
  app.patch<{
    Params: { id: string };
    Body: {
      ocrText?: string;
      ocrLatex?: string[];
      subject?: string;
      difficulty?: number;
      knowledgePoints?: string[];
      ocrConfirmed?: boolean;
    };
  }>("/api/problems/:id", async (req, reply) => {
    const body = req.body ?? {};
    const subject =
      typeof body.subject === "string" && SUBJECTS.includes(body.subject as Subject)
        ? (body.subject as Subject)
        : undefined;

    const problem = updateProblem(req.params.id, {
      ocrText: body.ocrText,
      ocrLatex: body.ocrLatex,
      subject,
      difficulty: body.difficulty,
      knowledgePoints: body.knowledgePoints,
      ocrConfirmed: body.ocrConfirmed,
    });

    if (!problem) {
      return reply
        .code(404)
        .send({ ok: false, error: { code: "NOT_FOUND", message: "题目不存在" } });
    }
    return { ok: true, data: { problem } };
  });

  /** 重新识别（换图或识别结果偏差太大时） */
  app.post<{ Params: { id: string }; Body: { imageBase64?: string; mime?: string } }>(
    "/api/problems/:id/analyze",
    async (req, reply) => {
      const problem = getProblem(req.params.id);
      if (!problem) {
        return reply
          .code(404)
          .send({ ok: false, error: { code: "NOT_FOUND", message: "题目不存在" } });
      }

      const { imageBase64, mime } = req.body ?? {};
      if (!imageBase64) {
        return reply.code(400).send({
          ok: false,
          error: { code: "NO_IMAGE", message: "重新分析需要重新提供图片" },
        });
      }

      const analysis = await analyzeImage(`data:${mime ?? "image/jpeg"};base64,${imageBase64}`);
      const updated = updateProblem(req.params.id, {
        ocrText: analysis.ocrText,
        ocrLatex: analysis.ocrLatex,
        subject: analysis.subject,
        difficulty: analysis.difficulty,
        knowledgePoints: analysis.knowledgePoints,
      });

      return { ok: true, data: { problem: updated } };
    },
  );
}
