import type { AltRoute, GuideMap, GuideStep, Problem } from "../shared.js";

import { logger } from "../lib/logger.js";
import { extractJson } from "../lib/util.js";
import { getProvider, textModel } from "../providers/index.js";
import { loadPrompt } from "./promptBuilder.js";

/**
 * 引导地图生成（D10 / D11 —— 分析前置）。
 *
 * 这是「学生说不会时不能只让他再想想」的结构性保障：
 * 每步**必填** analysis（在考什么）与 approach（怎么下手），
 * 把思路在备课阶段就写进地图，对话轮只是讲出来。
 */

export interface PlanResult {
  guideMap: GuideMap;
  /** 标准答案，仅内部校验用，永不返回给客户端 */
  answer: string;
  /** 首次生成的校验失败原因（用于观测提示词质量） */
  firstAttemptIssue: string | null;
}

interface RawStep {
  index?: number;
  goal?: string;
  analysis?: string;
  approach?: string;
  ladder?: { s1?: string; s2?: string; s3?: string };
  common_wrong?: string;
}

interface RawPlan {
  answer?: string;
  route_preview?: string;
  steps?: RawStep[];
  alt_routes?: Array<{ name?: string; when?: string; steps?: string[] }>;
  pitfalls?: string[];
}

export async function buildGuideMap(
  problem: Pick<Problem, "ocrText" | "subject" | "difficulty" | "knowledgePoints">,
  signal?: AbortSignal,
): Promise<PlanResult> {
  const system = await loadPrompt("plan");
  const user = buildUserPrompt(problem);

  const first = await requestPlan(system, user, signal);
  let issue = first.issue;
  let map = first.map;

  // 结构不合格就带着原因重生成一次 —— 地图是整个引导过程的骨架，不能带病上线
  if (!map) {
    logger.warn("plan: 首次生成不合格，重试一次", issue);
    const retryUser = `${user}\n\n# 上一次的问题\n${issue}\n请修正后重新输出完整 JSON。`;
    const second = await requestPlan(system, retryUser, signal);
    if (!second.map) {
      throw new Error(`引导地图生成失败：${second.issue ?? "未知原因"}`);
    }
    map = second.map;
  }

  return { guideMap: map, answer: first.answer, firstAttemptIssue: issue };
}

async function requestPlan(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<{ map: GuideMap | null; answer: string; issue: string | null }> {
  const raw = await getProvider().chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { model: textModel(), json: true, temperature: 0.4, signal },
  );

  const parsed = extractJson<RawPlan>(raw);
  if (!parsed) return { map: null, answer: "", issue: "返回内容不是合法 JSON" };

  const map = normalize(parsed);
  const issue = validate(map);
  return { map: issue ? null : map, answer: (parsed.answer ?? "").trim(), issue };
}

function buildUserPrompt(
  problem: Pick<Problem, "ocrText" | "subject" | "difficulty" | "knowledgePoints">,
): string {
  return [
    "# 题目",
    problem.ocrText || "（题干为空）",
    "",
    "# 已知信息",
    `- 学科：${problem.subject}`,
    `- 难度：${problem.difficulty}/5`,
    `- 知识点：${problem.knowledgePoints.join("、") || "未标注"}`,
  ].join("\n");
}

function normalize(raw: RawPlan): GuideMap {
  const steps: GuideStep[] = (raw.steps ?? []).map((s, i) => ({
    index: typeof s.index === "number" && s.index > 0 ? s.index : i + 1,
    goal: (s.goal ?? "").trim(),
    analysis: (s.analysis ?? "").trim(),
    approach: (s.approach ?? "").trim(),
    ladder: {
      S1: (s.ladder?.s1 ?? "").trim(),
      S2: (s.ladder?.s2 ?? "").trim(),
      S3: (s.ladder?.s3 ?? "").trim(),
    },
    commonWrong: s.common_wrong?.trim() || undefined,
  }));

  const altRoutes: AltRoute[] = (raw.alt_routes ?? [])
    .map((r) => ({
      name: (r.name ?? "").trim(),
      when: (r.when ?? "").trim(),
      steps: (r.steps ?? []).filter((s) => typeof s === "string" && s.trim()),
    }))
    .filter((r) => r.name && r.when && r.steps.length > 0);

  return {
    steps,
    routePreview: (raw.route_preview ?? "").trim(),
    altRoutes,
    pitfalls: (raw.pitfalls ?? []).filter((s) => typeof s === "string" && s.trim()),
  };
}

/** 结构校验（P8）。返回问题描述，通过则返回 null。 */
export function validate(map: GuideMap): string | null {
  if (map.steps.length < 3 || map.steps.length > 6) {
    return `steps 数量为 ${map.steps.length}，要求 3~6 步`;
  }

  for (const [i, s] of map.steps.entries()) {
    if (!s.goal) return `第 ${i + 1} 步缺 goal`;
    if (!s.analysis) return `第 ${i + 1} 步缺 analysis（在考什么）—— 这是必填项`;
    if (!s.approach) return `第 ${i + 1} 步缺 approach（怎么下手）—— 这是必填项`;
    if (!s.ladder.S1 || !s.ladder.S2 || !s.ladder.S3) return `第 ${i + 1} 步的阶梯不完整`;
    const set = new Set([s.ladder.S1, s.ladder.S2, s.ladder.S3]);
    if (set.size < 3) return `第 ${i + 1} 步的 S1/S2/S3 彼此重复，必须逐级更具体`;
  }

  const goals = map.steps.map((s) => s.goal);
  if (new Set(goals).size !== goals.length) return "steps 的 goal 存在重复";

  if (!map.routePreview) return "缺 route_preview（路径预告）";

  return null;
}
