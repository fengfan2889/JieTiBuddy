import type {
  GuideMap,
  GuideStep,
  MetaEvent,
  QuickAction,
  SessionMode,
  StudentState,
  SupportLevel,
} from "../shared.js";
import { DEFAULT_QUICK_REPLIES } from "../shared.js";

import {
  appendMessage,
  getProblem,
  getSessionInternal,
  recentMessages,
  updateSession,
} from "../db/repo.js";
import type { SessionInternal } from "../db/repo.js";
import { logger } from "../lib/logger.js";
import { extractJson, now } from "../lib/util.js";
import { getProvider, textModel } from "../providers/index.js";
import { buildFallback, checkReply } from "./guard.js";
import type { GuardResult } from "./guard.js";
import type { StudentContext } from "./promptBuilder.js";
import { OUTPUT_CONTRACT, buildStateBlock, loadPrompt } from "./promptBuilder.js";
import { transition } from "./stateMachine.js";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface TurnResult {
  meta: MetaEvent;
  text: string;
  degraded: boolean;
  isSolved: boolean;
  messageId: string;
}

// ---------- 对外入口 ----------

/** 首轮：路径预告 + 迈出第一步 */
export function startTurn(sessionId: string, signal?: AbortSignal): Promise<TurnResult> {
  return runTurn({ sessionId, userText: "", isFirst: true, signal });
}

/** 学生说完一句之后 */
export function studentTurn(
  sessionId: string,
  userText: string,
  action?: QuickAction,
  signal?: AbortSignal,
): Promise<TurnResult> {
  return runTurn({ sessionId, userText, action, isFirst: false, signal });
}

// ---------- 主流程 ----------

interface RunTurnInput {
  sessionId: string;
  userText: string;
  action?: QuickAction;
  isFirst: boolean;
  signal?: AbortSignal;
}

async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const session = getSessionInternal(input.sessionId);
  if (!session) throw new NotFoundError("会话不存在");
  const problem = getProblem(session.problemId);
  if (!problem) throw new NotFoundError("题目不存在");

  const map = session.guideMap;
  if (session.mode === "guide" && !map) {
    throw new Error("该会话还没有引导地图，请先走 /start");
  }

  if (!input.isFirst && input.userText.trim()) {
    appendMessage({ sessionId: session.id, role: "user", content: input.userText.trim() });
  }

  const totalSteps = map?.steps.length ?? 1;
  const plan = planTurn({ session, action: input.action, isFirst: input.isFirst, totalSteps });

  const step = map ? findStep(map, plan.stepIndex) : null;
  const recent = buildRecentDigest(session.id);

  const ctx: StudentContext = {
    stepIndex: plan.stepIndex,
    totalSteps,
    supportLevel: plan.baseLevel,
    currentRoute: plan.route,
    turnCount: session.turnCount + (input.isFirst ? 0 : 1),
    studentState: session.studentState,
  };

  const system = await loadPrompt("tutor.system");
  const taskBlock = input.isFirst
    ? "# 本轮任务（本题的第一轮）\n学生还没说话。请先给出整体路径预告，然后给出第一步的引导。"
    : `# 学生本轮输入\n${input.userText}`;

  const userPrompt = [
    map ? buildStateBlock(map, ctx, recent) : "",
    "",
    taskBlock,
    "",
    OUTPUT_CONTRACT,
  ]
    .filter((s) => s !== undefined)
    .join("\n");

  const generated = await generateReply({
    system,
    userPrompt,
    mode: session.mode,
    level: plan.baseLevel,
    step,
    signal: input.signal,
  });

  // 档位以状态机为准（禁跳级由状态机保证），模型自报的只做观测
  const t = transition({
    state: generated.state,
    current: plan.baseLevel,
    stuckStreak: session.stuckStreak,
    turnCount: session.turnCount,
    totalSteps,
    stepIndex: session.stepIndex,
  });

  const nextRoute =
    t.shouldSwitchRoute && !plan.routeLocked ? (pickAltRoute(map, plan.route) ?? plan.route) : plan.route;
  const isSolved = generated.isSolved || t.solved;

  const message = appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: generated.reply,
    contentType: input.isFirst ? "hint" : "feedback",
    state: generated.state,
    supportLevel: t.supportLevel,
  });

  updateSession(session.id, {
    supportLevel: t.supportLevel,
    studentState: generated.state,
    stepIndex: t.nextStepIndex,
    currentRoute: nextRoute,
    stuckStreak: t.shouldSwitchRoute ? 0 : t.stuckStreak,
    turnCount: session.turnCount + (input.isFirst ? 0 : 1),
    status: isSolved ? "solved" : "active",
    finishedAt: isSolved ? now() : null,
  });

  logger.debug("turn done", {
    state: generated.state,
    level: `S${plan.baseLevel}->S${t.supportLevel}`,
    modelSelfReportedLevel: generated.selfReportedLevel,
    degraded: generated.degraded,
  });

  const meta: MetaEvent = {
    mode: session.mode,
    state: generated.state,
    supportLevel: t.supportLevel,
    stepIndex: t.nextStepIndex,
    totalSteps,
    stepGoal: step?.goal ?? "",
    routePreview: input.isFirst && map ? map.routePreview : null,
    stepLadder: input.isFirst && step ? step.ladder : null,
    canSwitchRoute: !!(map && map.altRoutes.length > 0 && (t.shouldSwitchRoute || t.stuckStreak >= 1)),
    quickReplies: generated.quickReplies,
  };

  return {
    meta,
    text: generated.reply,
    degraded: generated.degraded,
    isSolved,
    messageId: message.id,
  };
}

// ---------- 轮次规划 ----------

interface TurnPlan {
  baseLevel: SupportLevel;
  stepIndex: number;
  route: string;
  /** 本轮由快捷动作锁定了路径，不再自动换路 */
  routeLocked: boolean;
}

function planTurn(args: {
  session: SessionInternal;
  action?: QuickAction;
  isFirst: boolean;
  totalSteps: number;
}): TurnPlan {
  const { session, action, isFirst } = args;

  if (isFirst) {
    return { baseLevel: 0, stepIndex: 1, route: "main", routeLocked: false };
  }

  let baseLevel = session.supportLevel;
  let route = session.currentRoute;
  let routeLocked = false;

  switch (action) {
    case "MORE_DETAIL":
      baseLevel = clampLevel(session.supportLevel + 1);
      break;
    case "EXPLAIN_THIS_STEP":
      baseLevel = 3;
      break;
    case "SWITCH_ROUTE":
      route = pickAltRoute(session.guideMap, route) ?? route;
      routeLocked = true;
      break;
    default:
      break;
  }

  return { baseLevel, stepIndex: session.stepIndex, route, routeLocked };
}

// ---------- 生成 + 校验 ----------

interface GenerateInput {
  system: string;
  userPrompt: string;
  mode: SessionMode;
  level: SupportLevel;
  step: GuideStep | null;
  signal?: AbortSignal;
}

interface GenerateOutput {
  reply: string;
  state: StudentState;
  quickReplies: string[];
  isSolved: boolean;
  degraded: boolean;
  selfReportedLevel: number | null;
}

interface RawTurn {
  student_state?: string;
  reply?: string;
  support_level?: number;
  quick_replies?: string[];
  is_solved?: boolean;
}

const VALID_STATES = new Set<StudentState>([
  "CORRECT",
  "PARTIAL",
  "WRONG",
  "STUCK",
  "OFF_TRACK",
  "WANTS_ANSWER",
  "ASK_WHY",
  "SOLVED",
]);

/**
 * 一次性生成完整回复再校验，而不是边流式边推。
 *
 * 权衡说明：空泛话术是本项目最致命的产品风险，必须能在发出前拦下重写。
 * 代价是首字延迟变为整段延迟（qwen 文本模型 3~8s），换来的是"绝不发出废回复"。
 */
async function generateReply(input: GenerateInput): Promise<GenerateOutput> {
  const provider = getProvider();

  const call = (extra?: string): Promise<string> =>
    provider.chat(
      [
        { role: "system", content: input.system },
        {
          role: "user",
          content: extra ? `${input.userPrompt}\n\n${extra}` : input.userPrompt,
        },
      ],
      { model: textModel(), json: true, temperature: 0.4, signal: input.signal },
    );

  let raw = await call();
  let parsed = parseTurn(raw);
  let guard = parsed ? checkReply(parsed.reply, input.mode) : ({ ok: false, reason: "EMPTY" } as GuardResult);

  if (!guard.ok) {
    logger.warn("guard 拦截，重生成一次", { reason: guard.reason, matched: guard.matched });
    raw = await call(retryHint(guard));
    parsed = parseTurn(raw);
    guard = parsed ? checkReply(parsed.reply, input.mode) : ({ ok: false, reason: "EMPTY" } as GuardResult);
  }

  // 两次都没过：降级为引导地图里的原始内容。空泛是红线，机械只是体验折损。
  if (!guard.ok || !parsed) {
    const fallback = input.step
      ? buildFallback(input.step, input.level)
      : "这道题我们现在这一步还没走通。你先说说，卡在哪一句上？是不知道用哪个公式，还是算不下去？";

    logger.warn("guard 二次拦截，降级为模板回复", { reason: guard.reason });

    return {
      reply: fallback,
      state: parsed?.state ?? "PARTIAL",
      quickReplies: parsed?.quickReplies?.length ? parsed.quickReplies : [...DEFAULT_QUICK_REPLIES],
      isSolved: false,
      degraded: true,
      selfReportedLevel: parsed?.selfReportedLevel ?? null,
    };
  }

  return { ...parsed, degraded: false };
}

function parseTurn(raw: string): {
  reply: string;
  state: StudentState;
  quickReplies: string[];
  isSolved: boolean;
  selfReportedLevel: number | null;
} | null {
  const json = extractJson<RawTurn>(raw);
  if (!json) return null;

  const reply = (json.reply ?? "").trim();
  if (!reply) return null;

  const state = VALID_STATES.has(json.student_state as StudentState)
    ? (json.student_state as StudentState)
    : "PARTIAL";

  const quickReplies = (json.quick_replies ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 3);

  return {
    reply,
    state,
    quickReplies: quickReplies.length >= 2 ? quickReplies : [...DEFAULT_QUICK_REPLIES],
    isSolved: json.is_solved === true,
    selfReportedLevel: typeof json.support_level === "number" ? json.support_level : null,
  };
}

function retryHint(guard: GuardResult): string {
  const reason =
    guard.reason === "ANSWER_LEAK"
      ? `你上一次的回复里出现了「${guard.matched}」这类泄露答案的表述。引导模式下严禁给出最终答案或最终数值结论。`
      : guard.reason === "VAGUE"
        ? `你上一次的回复里出现了「${guard.matched}」这类空泛话术。学生卡住时需要的是「这一步在考什么 + 该怎么下手」，不是让他自己再想想。`
        : "你上一次的回复信息量不足。";

  return [
    "# 上次输出被系统拒绝",
    reason,
    "",
    "请重写 reply：必须讲清「这一步在考什么」和「具体怎么下手」，让学生读完能往前迈一步。",
    "如果当前是 S0~S1，可以直接讲思路和该用的方法；如果是 S2~S3，可以把式子结构摆出来。",
    "但仍然不得给出最终答案。",
    "只输出 JSON，不要任何解释文字。",
  ].join("\n");
}

// ---------- 小工具 ----------

function findStep(map: GuideMap, index: number): GuideStep | null {
  return map.steps.find((s) => s.index === index) ?? map.steps[0] ?? null;
}

function pickAltRoute(map: GuideMap | null, current: string): string | null {
  if (!map || map.altRoutes.length === 0) return null;
  const idx = map.altRoutes.findIndex((r) => r.name === current);
  if (idx === -1) return map.altRoutes[0]?.name ?? null;
  const next = map.altRoutes[idx + 1] ?? map.altRoutes[0];
  return next?.name ?? null;
}

function clampLevel(n: number): SupportLevel {
  return Math.min(3, Math.max(0, n)) as SupportLevel;
}

function buildRecentDigest(sessionId: string): string {
  const msgs = recentMessages(sessionId, 6);
  if (msgs.length === 0) return "";
  return msgs
    .map((m) => {
      const who = m.role === "user" ? "学生" : "老师";
      const text = m.content.length > 300 ? `${m.content.slice(0, 300)}…` : m.content;
      return `${who}：${text}`;
    })
    .join("\n\n");
}
