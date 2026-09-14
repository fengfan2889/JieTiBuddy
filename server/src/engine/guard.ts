import type { GuideStep, SessionMode, SupportLevel } from "../shared.js";
import { SUPPORT_LEVEL_LABEL, VAGUE_PATTERNS, ANSWER_LEAK_PATTERNS } from "../shared.js";

/**
 * 后置校验层（R11：空泛话术回潮 —— 本项目最致命的产品风险）。
 *
 * 光靠提示词管不住模型。这一层不依赖模型自觉：
 * 引导模式下，任何「去掉情绪词后什么都没讲」的回复都会被拦下重生成；
 * 再拦一次就降级为当前步 analysis + approach 的模板拼接，保证最小信息量。
 */

export type GuardReason = "EMPTY" | "TOO_SHORT" | "VAGUE" | "ANSWER_LEAK";

export interface GuardResult {
  ok: boolean;
  reason?: GuardReason;
  matched?: string;
}

/** 尾句短于此长度且命中黑名单，才判定为空泛 —— 避免误伤「先肯定 + 具体追问」的正常回复 */
const TAIL_LENGTH_LIMIT = 22;
const MIN_REPLY_LENGTH = 15;

export function checkReply(text: string, mode: SessionMode): GuardResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "EMPTY" };

  // 答案泄露优先于长度判断。
  // 「答案是 3」这种最短的回复恰恰是最危险的泄露形态，
  // 若先被长度检查拦下，重试提示词会给错方向（让它"多讲点"而不是"别给答案"）。
  if (mode === "guide") {
    const leak = matchAny(trimmed, ANSWER_LEAK_PATTERNS);
    if (leak) return { ok: false, reason: "ANSWER_LEAK", matched: leak };
  }

  if (trimmed.length < MIN_REPLY_LENGTH) return { ok: false, reason: "TOO_SHORT" };

  const tail = lastSentence(trimmed);
  if (tail.length <= TAIL_LENGTH_LIMIT) {
    const vague = matchAny(tail, VAGUE_PATTERNS);
    if (vague) return { ok: false, reason: "VAGUE", matched: vague };
  }
  // 整段都是空泛（没有具体内容可讲）的情况
  const vagueAll = matchAny(trimmed, VAGUE_PATTERNS);
  if (vagueAll && trimmed.length <= 60) {
    return { ok: false, reason: "VAGUE", matched: vagueAll };
  }

  return { ok: true };
}

function matchAny(text: string, patterns: readonly RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function lastSentence(text: string): string {
  const parts = text
    .split(/[。！？!?\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * 降级回复：直接从引导地图的当前步拼出来。
 * 空泛是产品红线，机械只是体验折损 —— 两害相权取其轻。
 */
export function buildFallback(step: GuideStep, level: SupportLevel): string {
  const header = `我们聚焦这一步：**${step.goal}**。`;

  switch (level) {
    case 0:
      return [
        header,
        "",
        step.analysis,
        "",
        `那这一步先做什么？${step.approach}`,
      ].join("\n");
    case 1:
      return [header, "", step.analysis, "", step.ladder.S1].join("\n");
    case 2:
      return [header, "", step.ladder.S2].join("\n");
    default:
      return [header, "", step.ladder.S3].join("\n");
  }
}

/** 供日志/调试输出当前强度的人类可读标签 */
export function describeLevel(level: SupportLevel): string {
  return `S${level} ${SUPPORT_LEVEL_LABEL[level]}`;
}
