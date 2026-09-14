import { describe, expect, it } from "vitest";

import { reconcileLevel, transition } from "./stateMachine.js";
import type { StudentState } from "../shared.js";

/**
 * T11 / T15 —— 支持强度跃迁规则。
 * 核心断言两条：
 *   1. 禁止跳级（相邻两轮最多差 1 级）
 *   2. 学生说"不会"时档位只能升、不能降（对应"绝不让学生干想"）
 */

function run(state: StudentState, current: 0 | 1 | 2 | 3, stuckStreak = 0) {
  return transition({
    state,
    current,
    stuckStreak,
    turnCount: 1,
    totalSteps: 3,
    stepIndex: 1,
  });
}

describe("transition —— 档位跃迁", () => {
  it("STUCK 升一级（说不会时必须给得更具体）", () => {
    expect(run("STUCK", 0).supportLevel).toBe(1);
    expect(run("STUCK", 1).supportLevel).toBe(2);
    expect(run("STUCK", 3).supportLevel).toBe(3);
  });

  it("CORRECT 降一级并把进度推进", () => {
    const result = run("CORRECT", 2);
    expect(result.supportLevel).toBe(1);
    expect(result.advanceStep).toBe(true);
    expect(result.nextStepIndex).toBe(2);
  });

  it("CORRECT 不会降级到负数，也不会越过最后一步", () => {
    expect(run("CORRECT", 0).supportLevel).toBe(0);
    const last = transition({
      state: "CORRECT",
      current: 0,
      stuckStreak: 0,
      turnCount: 5,
      totalSteps: 3,
      stepIndex: 3,
    });
    expect(last.nextStepIndex).toBe(3);
  });

  it("禁止跳级：任何状态单轮最多变动一级", () => {
    const states: StudentState[] = [
      "CORRECT",
      "PARTIAL",
      "WRONG",
      "STUCK",
      "OFF_TRACK",
      "WANTS_ANSWER",
      "ASK_WHY",
    ];
    for (const state of states) {
      for (const current of [0, 1, 2, 3] as const) {
        const { supportLevel } = run(state, current);
        expect(Math.abs(supportLevel - current)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ASK_WHY 保持档位（先正面回答，不借机降级）", () => {
    expect(run("ASK_WHY", 1).supportLevel).toBe(1);
    expect(run("ASK_WHY", 2).supportLevel).toBe(2);
  });

  it("WANTS_ANSWER 拒绝直给，但补偿式升一档", () => {
    expect(run("WANTS_ANSWER", 0).supportLevel).toBe(1);
  });
});

describe("transition —— 换路径与收尾", () => {
  it("连续两次无进展触发换路径", () => {
    expect(run("STUCK", 0, 0).shouldSwitchRoute).toBe(false);
    expect(run("STUCK", 0, 1).shouldSwitchRoute).toBe(true);
  });

  it("答对时清零连续无进展计数", () => {
    expect(run("CORRECT", 1, 3).stuckStreak).toBe(0);
  });

  it("超过轮次上限转入收尾", () => {
    const result = transition({
      state: "STUCK",
      current: 3,
      stuckStreak: 5,
      turnCount: 12,
      totalSteps: 3,
      stepIndex: 2,
    });
    expect(result.shouldFinalize).toBe(true);
  });

  it("SOLVED 标记为已解出", () => {
    expect(run("SOLVED", 1).solved).toBe(true);
  });
});

describe("reconcileLevel —— 模型自报档位的兜底", () => {
  it("模型想跳级时压回一级", () => {
    expect(reconcileLevel(3, 1)).toBe(2);
  });

  it("非法值沿用上一轮档位", () => {
    expect(reconcileLevel(undefined, 2)).toBe(2);
    expect(reconcileLevel(Number.NaN, 2)).toBe(2);
  });

  it("越界值被夹到 0~3", () => {
    expect(reconcileLevel(99, 3)).toBe(3);
    expect(reconcileLevel(-5, 0)).toBe(0);
  });
});
