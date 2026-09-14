import type { StudentState, SupportLevel } from "../shared.js";
import { MAX_GUIDE_TURNS, ROUTE_SWITCH_THRESHOLD } from "../shared.js";

/**
 * 支持强度状态机。
 *
 * 🔴 核心语义：升档 = 「更具体」，不是「更接近答案」。
 *    S0 是默认档且必须给足（分析 + 思路），不存在「什么都不给」的低档。
 *
 * 🔴 禁跳级：每轮相对上一轮最多变动 1 级。
 */

export interface TransitionInput {
  state: StudentState;
  current: SupportLevel;
  stuckStreak: number;
  turnCount: number;
  totalSteps: number;
  stepIndex: number;
}

export interface TransitionResult {
  supportLevel: SupportLevel;
  stuckStreak: number;
  /** 学生答对且不是最后一步 → 推进到下一步 */
  advanceStep: boolean;
  /** 连续无进展达阈值 → 建议换到 alt_routes */
  shouldSwitchRoute: boolean;
  /** 超过轮次上限 → 转「完整解析 + 薄弱知识点定位」 */
  shouldFinalize: boolean;
  solved: boolean;
  nextStepIndex: number;
}

function clampLevel(n: number): SupportLevel {
  return Math.min(3, Math.max(0, n)) as SupportLevel;
}

export function transition(input: TransitionInput): TransitionResult {
  const { state, current, turnCount, totalSteps, stepIndex } = input;
  let level = current;
  let stuckStreak = input.stuckStreak;
  let advanceStep = false;
  let solved = false;

  switch (state) {
    case "CORRECT":
      level = clampLevel(current - 1);
      stuckStreak = 0;
      advanceStep = true;
      break;

    case "PARTIAL":
      // 方向对但不完整：不加提示也不要撤提示，补一个追问点即可
      stuckStreak = 0;
      break;

    case "WRONG":
      level = clampLevel(current + 1);
      stuckStreak += 1;
      break;

    case "STUCK":
      // 说「不会」时唯一正确的动作是给更具体的内容，绝不是「再想想」
      level = clampLevel(current + 1);
      stuckStreak += 1;
      break;

    case "WANTS_ANSWER":
      // 要答案 → 拒绝直给，但补偿式地讲细一档
      level = clampLevel(current + 1);
      break;

    case "ASK_WHY":
      // 「为什么这么做」→ 保持档位，正面回答。不许把问题反问回去。
      break;

    case "OFF_TRACK":
      // 答非所问 → 先复述题目要求，档位不动
      break;

    case "SOLVED":
      solved = true;
      break;

    default:
      break;
  }

  const nextStepIndex = advanceStep ? Math.min(stepIndex + 1, totalSteps) : stepIndex;

  return {
    supportLevel: level,
    stuckStreak,
    advanceStep,
    shouldSwitchRoute: stuckStreak >= ROUTE_SWITCH_THRESHOLD,
    shouldFinalize: turnCount + 1 >= MAX_GUIDE_TURNS && !solved,
    solved,
    nextStepIndex,
  };
}

/**
 * 模型自报的 support_level 只做参考，最终以状态机为准 —— 防止模型自己一路加到 S3。
 * 返回经过「禁跳级」约束后的合法档位。
 */
export function reconcileLevel(modelLevel: unknown, from: SupportLevel): SupportLevel {
  if (typeof modelLevel !== "number" || Number.isNaN(modelLevel)) return from;
  const target = clampLevel(Math.round(modelLevel));
  if (target > from) return clampLevel(from + 1);
  if (target < from) return clampLevel(from - 1);
  return from;
}
