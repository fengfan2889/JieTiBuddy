import { describe, expect, it } from "vitest";

import {
  normalizeBareLatex,
  normalizeProblemText,
  serializeEditorDom,
  splitProblemParts,
  tidyEditedText,
  type EditableNode,
} from "./latex";

/**
 * 这一组测试是补上的 —— 之前没有，于是 `normalizeBareLatex` 把跨行 `$$…$$` 块
 * 里的公式源当成裸 LaTeX 包上了 `$`，界面上整篇解析漏出一屏 `$…$`（真实事故）。
 * 纯文本转换逻辑必须锁住，它没有任何类型系统能兜住的错误。
 */

// ---------- 假 DOM：只用普通对象，跑的是 src 里那份真代码 ----------

type N = EditableNode & { dataset?: { latex?: string; display?: string } };

const textNode = (v: string): N => ({ nodeType: 3, textContent: v, childNodes: [] });
const br = (): N => ({ nodeType: 1, tagName: "BR", dataset: {}, childNodes: [] });
const div = (children: N[]): N => ({
  nodeType: 1,
  tagName: "DIV",
  dataset: {},
  childNodes: children,
});
const chip = (latex: string, display = false): N => ({
  nodeType: 1,
  tagName: "SPAN",
  dataset: display ? { latex, display: "1" } : { latex },
  childNodes: [],
});
const root = (children: N[]): N => ({
  nodeType: 1,
  tagName: "DIV",
  dataset: {},
  childNodes: children,
});

/** 模拟「把文本灌进编辑区」：文字按 \n 拆成 text + <br>，公式变卡片 */
function buildDom(text: string): N {
  const children: N[] = [];
  for (const part of splitProblemParts(text)) {
    if (part.type === "math") {
      children.push(chip(part.value, part.display));
      continue;
    }
    part.value.split("\n").forEach((line, i) => {
      if (i > 0) children.push(br());
      if (line) children.push(textNode(line));
    });
  }
  return root(children);
}

const roundTrip = (text: string) => tidyEditedText(serializeEditorDom(buildDom(text)));

// ---------- 回归：块级公式被 `$` 污染 ----------

describe("normalizeBareLatex", () => {
  it("跨行 $$…$$ 块一个字符都不动（真实事故的回归）", () => {
    const src = "得唯一驻点\n\n$$\nx_0=-\\frac{\\ln a}{a}.\n$$\n\n又 $g''(x)>0$。";
    expect(normalizeBareLatex(src)).toBe(src);
  });

  it("行内 $$x=1$$ 也不动", () => {
    expect(normalizeBareLatex("所以 $$x=1$$ 成立。")).toBe("所以 $$x=1$$ 成立。");
  });

  it("裸 LaTeX 仍然会被补上 $", () => {
    expect(normalizeBareLatex("所以 f(x) = x - \\frac{1}{a} ln x 递增。")).toBe(
      "所以 $f(x) = x - \\frac{1}{a} ln x$ 递增。",
    );
  });

  it("没有 LaTeX 命令的普通文字原样返回", () => {
    expect(normalizeBareLatex("这题用罗尔定理。")).toBe("这题用罗尔定理。");
  });

  it("$$ 块外的裸 LaTeX 照补，块内的不动", () => {
    const src = "先看 \\frac{a}{b} 的值：\n\n$$\nF(x)=2x-\\frac1a\\ln x\n$$";
    expect(normalizeBareLatex(src)).toBe(
      "先看 $\\frac{a}{b}$ 的值：\n\n$$\nF(x)=2x-\\frac1a\\ln x\n$$",
    );
  });
});

// ---------- 题干换行兜底 ----------

describe("normalizeProblemText", () => {
  it("整段没换行时按小问拆行", () => {
    const src =
      "18. 已知函数 $f(x)=x-\\frac{1}{a}\\ln x$ 与 $g(x)=e^{ax}-x$, 其中 $a>0$(1)求 $f(x)$ 的单调区间;(2)若 $g(x)>0$, 求 $a$ 的取值范围;";
    expect(normalizeProblemText(src).split("\n")).toHaveLength(3);
  });

  it("模型已经分好行就尊重它", () => {
    const src = "第一行\n第二行";
    expect(normalizeProblemText(src)).toBe(src);
  });

  it("圈码 ① 不当拆分点（它在选择题里是选项内容）", () => {
    // 选项之间该断行（`B.` 另起一行），但 `①②` 是选项内容，不能各拆一行
    expect(normalizeProblemText("下列正确的是（ ）A. ①② B. ②③")).toBe(
      "下列正确的是（ ）A. ①②\nB. ②③",
    );
  });
});

// ---------- 题干编辑器：文本 ↔ 片段往返 ----------

describe("splitProblemParts", () => {
  it("文字与行内公式交替切开", () => {
    expect(splitProblemParts("已知函数 $f(x)=x^2$ 单调递增")).toEqual([
      { type: "text", value: "已知函数 " },
      { type: "math", value: "f(x)=x^2", display: false },
      { type: "text", value: " 单调递增" },
    ]);
  });

  it("跨行 $$ 块整块算一个公式，并记住它是块级", () => {
    expect(splitProblemParts("$$\nx=1\n$$")).toEqual([
      { type: "math", value: "x=1", display: true },
    ]);
  });

  it("没有公式时只有一段文字", () => {
    expect(splitProblemParts("请证明勾股定理")).toEqual([
      { type: "text", value: "请证明勾股定理" },
    ]);
  });
});

describe("题干编辑器往返（内容不许丢）", () => {
  const cases: [string, string][] = [
    [
      "行内公式",
      "18. 已知函数 $f(x)=x-\\frac{1}{a}\\ln x$ 与函数 $g(x)=e^{ax}-x$, 其中 $a>0$",
    ],
    [
      "多行题干",
      "18. 已知函数 $f(x)=x-\\frac{1}{a}\\ln x$ 与 $g(x)=e^{ax}-x$\n(1)求 $f(x)$ 的单调区间;\n(2)若 $g(x)>0$, 求 $a$ 的取值范围;",
    ],
    ["纯文字", "纯文字，没有任何公式。\n第二行。"],
    ["只有一个公式", "$a>0$"],
  ];

  for (const [name, input] of cases) {
    it(`${name}：往返后一字不差`, () => {
      expect(roundTrip(input)).toBe(input);
    });

    it(`${name}：再往返一次仍是同一结果（幂等）`, () => {
      const once = roundTrip(input);
      expect(roundTrip(once)).toBe(once);
    });
  }

  it("跨行 $$ 块收成单行，但仍带 $$", () => {
    expect(roundTrip("$$\nF(x)=2x-\\frac1a\\ln x\n$$\n求 $F'(x)$。")).toBe(
      "$$F(x)=2x-\\frac1a\\ln x$$\n求 $F'(x)$。",
    );
  });

  it("改文字不影响公式", () => {
    const dom = root([
      textNode("已知函数 "),
      chip("f(x)=x^2"),
      textNode(" 在 R 上单调递增"),
    ]);
    expect(tidyEditedText(serializeEditorDom(dom))).toBe(
      "已知函数 $f(x)=x^2$ 在 R 上单调递增",
    );
  });

  it("改一条公式，另一条不动", () => {
    const dom = buildDom("已知 $f(x)=x^2$ 与 $g(x)=e^x$ 相交");
    const chips = Array.from(dom.childNodes).filter((n) => n.dataset?.latex !== undefined);
    chips[0]!.dataset!.latex = "f(x)=x^{3}";
    expect(tidyEditedText(serializeEditorDom(dom))).toBe("已知 $f(x)=x^{3}$ 与 $g(x)=e^x$ 相交");
  });

  it("删掉整条公式不留空壳", () => {
    const dom = buildDom("已知 $f(x)=x^2$ 递增");
    const left = Array.from(dom.childNodes).filter((n) => n.dataset?.latex === undefined);
    expect(tidyEditedText(serializeEditorDom(root(left)))).toBe("已知 递增");
  });

  it("回车：Chrome 的 <br> 当成换行", () => {
    expect(
      tidyEditedText(serializeEditorDom(root([textNode("第一行"), br(), textNode("第二行")]))),
    ).toBe("第一行\n第二行");
  });

  it("回车：部分输入法的 <div> 也当成换行（不能变成两条）", () => {
    expect(
      tidyEditedText(
        serializeEditorDom(root([div([textNode("第一行")]), div([textNode("第二行")])])),
      ),
    ).toBe("第一行\n第二行");
  });
});
