import type { Subject } from "../shared.js";

import { logger } from "../lib/logger.js";
import { extractJson } from "../lib/util.js";
import { getProvider, vlModel } from "../providers/index.js";
import { loadPrompt } from "./promptBuilder.js";

/** 图片里没有题目（风景照、空白页） */
export class NotAProblemError extends Error {
  constructor() {
    super("图片里没有识别到题目，换一张更清楚的照片试试");
    this.name = "NotAProblemError";
  }
}

export interface ImageAnalysis {
  ocrText: string;
  ocrLatex: string[];
  ocrConfidence: number;
  subject: Subject;
  gradeHint: string;
  difficulty: number;
  knowledgePoints: string[];
}

const SUBJECTS = new Set<Subject>(["math", "physics", "chemistry", "other"]);

interface RawAnalysis {
  is_problem?: boolean;
  error?: string;
  ocr_text?: string;
  ocr_latex?: string[] | string;
  ocr_confidence?: number;
  subject?: string;
  grade_hint?: string;
  difficulty?: number;
  knowledge_points?: string[];
}

/**
 * 读图分析：只负责「识别 + 归类」，不产出引导地图。
 *
 * 分两步是有意的 —— 识别用 VL 模型（贵），引导地图用文本模型基于
 * 学生**可能已修正过**的题干生成（便宜且更准）。
 */
export async function analyzeImage(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ImageAnalysis> {
  const system = await loadPrompt("analyze");
  const raw = await getProvider().chat(
    [
      { role: "system", content: system },
      { role: "user", content: "请识别并分析这张题目图片。", images: [imageUrl] },
    ],
    { model: vlModel(), json: true, temperature: 0.1, signal },
  );

  const parsed = extractJson<RawAnalysis>(raw);
  if (!parsed) {
    logger.warn("analyze: JSON 解析失败", raw.slice(0, 200));
    throw new Error("题目识别结果解析失败，请重试");
  }
  if (parsed.error === "NOT_A_PROBLEM") throw new NotAProblemError();

  return normalize(parsed);
}

function normalize(raw: RawAnalysis): ImageAnalysis {
  const subject = SUBJECTS.has(raw.subject as Subject) ? (raw.subject as Subject) : "other";

  let latex: string[] = [];
  if (Array.isArray(raw.ocr_latex)) latex = raw.ocr_latex.filter((s) => typeof s === "string");
  else if (typeof raw.ocr_latex === "string" && raw.ocr_latex.trim()) latex = [raw.ocr_latex];

  const confidence =
    typeof raw.ocr_confidence === "number" ? Math.min(1, Math.max(0, raw.ocr_confidence)) : 0.9;

  const difficulty =
    typeof raw.difficulty === "number" ? Math.min(5, Math.max(1, Math.round(raw.difficulty))) : 3;

  const knowledgePoints = Array.isArray(raw.knowledge_points)
    ? raw.knowledge_points.filter((s) => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  return {
    ocrText: (raw.ocr_text ?? "").trim(),
    ocrLatex: latex,
    ocrConfidence: confidence,
    subject,
    gradeHint: (raw.grade_hint ?? "").trim(),
    difficulty,
    knowledgePoints,
  };
}
