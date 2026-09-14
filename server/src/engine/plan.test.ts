import { describe, expect, it } from "vitest";

import { validate } from "./plan.js";
import type { AltRoute, GuideMap, GuideStep } from "../shared.js";

/**
 * P8 —— 引导地图结构校验。
 * 地图一次生成、全程复用：写得空的地图会让整场引导退化成"你再想想"。
 */

function makeStep(overrides: Partial<GuideStep> = {}): GuideStep {
  return {
    index: 1,
    goal: "把原式整理成顶点式",
    analysis: "顶点式能一眼读出最值，所以先把式子整理成这个形状。",
    approach: "用配方法，把 x² 与 x 凑成完全平方。",
    ladder: {
      S1: "取一次项系数的一半再平方。",
      S2: "写成 y = (x - 3)² - 9 + c，你只算括号里和修正项。",
      S3: "x² - 6x = (x - 3)² - 9，那原式能写成什么？",
    },
    ...overrides,
  };
}

function makeMap(overrides: Partial<GuideMap> = {}): GuideMap {
  return {
    steps: [
      makeStep({ index: 1 }),
      makeStep({ index: 2, goal: "读出顶点坐标" }),
      makeStep({ index: 3, goal: "回答题目问的量" }),
    ],
    routePreview: "这道题分三步走：先整理成顶点式，再读出顶点，最后回答题目。",
    altRoutes: [] as AltRoute[],
    pitfalls: [],
    ...overrides,
  };
}

describe("validate —— 引导地图结构校验", () => {
  it("合格地图通过", () => {
    expect(validate(makeMap())).toBeNull();
  });

  it("步骤数少于 3 判不合格", () => {
    expect(validate(makeMap({ steps: [makeStep(), makeStep({ index: 2 })] }))).toMatch(/3~6/);
  });

  it("步骤数多于 6 判不合格", () => {
    const steps = Array.from({ length: 7 }, (_, i) =>
      makeStep({ index: i + 1, goal: `第 ${i + 1} 步目标` }),
    );
    expect(validate(makeMap({ steps }))).toMatch(/3~6/);
  });

  it("缺 analysis 判不合格（这是 S0 的核心素材，不能省）", () => {
    const steps = makeMap().steps.map((s, i) => (i === 1 ? { ...s, analysis: "" } : s));
    expect(validate(makeMap({ steps }))).toMatch(/analysis/);
  });

  it("缺 approach 判不合格", () => {
    const steps = makeMap().steps.map((s, i) => (i === 0 ? { ...s, approach: "" } : s));
    expect(validate(makeMap({ steps }))).toMatch(/approach/);
  });

  it("阶梯三档雷同判不合格", () => {
    const steps = makeMap().steps.map((s, i) =>
      i === 0 ? { ...s, ladder: { S1: "同一句话", S2: "同一句话", S3: "同一句话" } } : s,
    );
    expect(validate(makeMap({ steps }))).toMatch(/重复/);
  });

  it("goal 重复判不合格", () => {
    const steps = makeMap().steps.map((s) => ({ ...s, goal: "同一个目标" }));
    expect(validate(makeMap({ steps }))).toMatch(/goal/);
  });

  it("缺路径预告判不合格", () => {
    expect(validate(makeMap({ routePreview: "" }))).toMatch(/route_preview/);
  });
});
