import { describe, expect, it } from "vitest";

import { buildFallback, checkReply } from "./guard.js";
import type { GuideStep } from "../shared.js";

/**
 * T7 / T15 / T16 —— 本项目最致命的两类风险的回归用例。
 * 这些断言不依赖模型自觉，全部作用在后置校验层上，因此可以常驻 CI。
 */

const step: GuideStep = {
  index: 1,
  goal: "把原式整理成顶点式",
  analysis: "顶点式的好处是横纵坐标一眼可见，所以先把它整理成这个形状。",
  approach: "往配方这个方向走，把 x² 和 x 凑成一个完全平方。",
  ladder: {
    S1: "配方时取 x 系数的一半再平方，这题是 -6，一半就是 -3。",
    S2: "写成 y = (x - 3)² - 9 + c，你只算括号里的和修正项。",
    S3: "完整演示：x² - 6x = (x - 3)² - 9，那原式能写成什么？",
  },
};

describe("checkReply —— 空泛话术黑名单（T16）", () => {
  const vagueSamples = [
    "你再想想？",
    "仔细读读题目。",
    "先自己试试看。",
    "动动脑筋。",
    "这道题应该不难呀。",
    "你觉得呢？",
    "很好，继续加油！",
  ];

  for (const sample of vagueSamples) {
    it(`拦截：${sample}`, () => {
      expect(checkReply(sample, "guide").ok).toBe(false);
    });
  }

  it("放行：含具体分析 + 思路的回复", () => {
    const good =
      "这题在问抛物线的最低点在哪。求这个点，标准做法是先把它写成顶点式——" +
      "因为顶点式里直接就能读出最低点的坐标。咱们分三步走，先看第一步：把式子整理成顶点式，" +
      "思路就是配方，把 x² - 6x 凑成一个完全平方。你先试着写成 (x - ?)² 加个修正项。";
    expect(checkReply(good, "guide").ok).toBe(true);
  });

  it("放行：先肯定再具体追问，不因尾句有问号就误伤", () => {
    const good =
      "你这个思路对了一半，缺的那一块很关键——你只考虑了二次项，忘了看一次项的符号。\n\n" +
      "回到配方这一步：x² - 6x 里，系数是 -6，你打算怎么处理这个负号？";
    expect(checkReply(good, "guide").ok).toBe(true);
  });
});

describe("checkReply —— 答案泄露（T7）", () => {
  const leaks = [
    "所以答案是 3。",
    "正确答案是 x = 3。",
    "最终结果为 y = -9。",
    "这道题应该选 B。",
  ];

  for (const sample of leaks) {
    it(`拦截：${sample}`, () => {
      const result = checkReply(sample, "guide");
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("ANSWER_LEAK");
    });
  }

  it("引导模式拦截，direct 模式放行", () => {
    const text = "正确答案是 x = 3，代入后 y = -9。";
    expect(checkReply(text, "guide").ok).toBe(false);
    expect(checkReply(text, "direct").ok).toBe(true);
  });

  it("不误伤正常反馈里的中间值", () => {
    const text =
      "你算的 x = 3 是对的。接下来这一步，把这个值代回原式，看看 y 会变成多少？";
    expect(checkReply(text, "guide").ok).toBe(true);
  });
});

describe("buildFallback —— 两次拦截后的降级输出", () => {
  it("S0 降级必须同时包含分析与思路", () => {
    const text = buildFallback(step, 0);
    expect(text).toContain(step.analysis);
    expect(text).toContain(step.approach);
  });

  it("S3 降级用单步演示，且仍不含最终答案", () => {
    const text = buildFallback(step, 3);
    expect(text).toContain(step.ladder.S3);
    expect(text).not.toMatch(/答案是|最终结果/);
  });
});
