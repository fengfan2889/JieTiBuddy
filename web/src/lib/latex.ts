/**
 * 公式文本的清洗 —— 与 React / KaTeX 无关，单独放，方便直接跑脚本验证。
 */

/** 一个 LaTeX 命令：反斜杠 + 至少两个字母（\frac \ln \sqrt \times …） */
const LATEX_CMD = /\\[a-zA-Z]{2,}/;

/** 中文与全角标点 —— 它们不会出现在数学片段里，正好当切分边界 */
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
const CJK_SPLIT = /([\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+)/;

/**
 * 兜底：给「没有 $ 包裹的裸 LaTeX」补上 `$`。
 *
 * 为什么需要它：模型偶尔会漏 `$`，把 `$f(x)=x-\frac{1}{a}\ln x$` 写成
 * `f(x) = x - \frac{1}{a} ln x`。没有 `$` 时 remark-math 不认，
 * 界面上就是一屏反斜杠 —— 对家长和学生来说，这比识别得不准还糟。
 * 提示词是主防线（`server/src/prompts/analyze.md` 里那条 🔴），这里只是第二道。
 *
 * 只在**整行一个 `$` 都没有**时才动手，避免破坏模型已经写对的公式。
 */
export function normalizeBareLatex(text: string): string {
  if (!LATEX_CMD.test(text)) return text;

  /**
   * 🔴 `$$...$$` 块内一个字符都不能动。
   *
   * 这里踩过一个狠的：块级公式的**公式源是自己独占一行的**（`$$\n f'(x)=…\n$$`），
   * 那一行既没有 `$` 又带 LaTeX 命令，于是被逐行处理时**被当成裸 LaTeX 包上了 `$`**：
   *
   *   $$\n f'(x)=…\n$$   →   $$\n $f'(x)=…$\n $$
   *
   * 结果 `$$` 块里混进了 `$`，Micromark 认不出这块数学，`$…$` 原样漏到界面上 ——
   * 学生看到的是 `得唯一驻点 $x_0=-\frac{\ln a}{a}.$ 又…`，一整篇解析全是反斜杠。
   * 实测：4 条真实解析过完这个函数，残留 `$` 从 **0 涨到 108~120**。
   *
   * 所以必须先判断「这一行在不在 `$$` 块里」，在就整行跳过。
   * 用 `$$` 出现次数的奇偶来配对：奇数 = 跨行块的边界，偶数 = 行内成对，都不用管。
   */
  let inDisplay = false;

  return text
    .split("\n")
    .map((line) => {
      const fences = (line.match(/\$\$/g) || []).length;

      if (inDisplay) {
        if (fences % 2 === 1) inDisplay = false;
        return line;
      }
      if (fences > 0) {
        if (fences % 2 === 1) inDisplay = true;
        return line;
      }

      return normalizeLine(line);
    })
    .join("\n");
}

/** 单行内补 `$`：只处理整行一个 `$` 都没有的纯文本行 */
function normalizeLine(line: string): string {
  if (line.includes("$") || !LATEX_CMD.test(line)) return line;

  // 按中文切段，只有含 LaTeX 命令的段才是公式
  return line
    .split(CJK_SPLIT)
    .map((seg) => {
      if (!seg || CJK.test(seg) || !LATEX_CMD.test(seg)) return seg;

      const core = seg.trim();
      if (!core) return seg;

      // 保留段首段尾空白，否则相邻文字会粘在一起
      const start = seg.indexOf(core);
      const head = seg.slice(0, start);
      const tail = seg.slice(start + core.length);
      return head + "$" + core + "$" + tail;
    })
    .join("");
}

// ---------- 题干编辑：文本 ↔ 可编辑片段 ----------
//
// 编辑态要把「文字」和「公式」分开对待（文字随便改、公式是一张卡片）。
// 这两件事都不该依赖 React / KaTeX，放这里才能脱离浏览器直接跑脚本验证。

/** `$$…$$` 与 `$…$`。题干里两者都可能出现，都当公式处理 */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

export type ProblemPart =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

/** 把题干原文切成「文字 / 公式」交替的片段 */
export function splitProblemParts(text: string): ProblemPart[] {
  const parts: ProblemPart[] = [];
  let last = 0;

  for (const m of text.matchAll(MATH_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: "text", value: text.slice(last, at) });

    const latex = (m[1] ?? m[2] ?? "").trim();
    // 两个捕获组：第一个命中说明原文是 `$$…$$`（块级），还原时要带回去
    if (latex) parts.push({ type: "math", value: latex, display: m[1] !== undefined });
    last = at + m[0].length;
  }

  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/**
 * 只用到 DOM 的这几点。抽成结构类型是为了能拿普通对象当假 DOM 跑测试 ——
 * 真实节点在调用处转一下即可。
 */
export interface EditableNode {
  nodeType: number;
  textContent?: string | null;
  tagName?: string;
  dataset?: { latex?: string; display?: string };
  childNodes: ArrayLike<EditableNode>;
}

const TEXT_NODE = 3;

/**
 * 把编辑区 DOM 读回 `$…$` 文本。
 *
 * 浏览器按回车可能生成 `<br>`（Chrome/Safari）也可能生成 `<div>`（部分输入法），
 * 两种都要当换行，否则用户按的回车会凭空消失。
 * `<div>` 只在**前面**补一个换行 —— 相邻两个 `<div>` 若前后都补，每条换行会变成两条。
 *
 * 公式卡片（`data-latex`）还原成 `$…$`；原本是 `$$…$$` 块级公式的带回 `data-display`，
 * 还原成 `$$…$$`，保证「编辑前后文本一字不差」。
 */
export function serializeEditorDom(root: EditableNode): string {
  let out = "";

  for (let i = 0; i < root.childNodes.length; i += 1) {
    const node = root.childNodes[i];
    if (!node) continue;

    if (node.nodeType === TEXT_NODE) {
      out += node.textContent ?? "";
      continue;
    }

    const latex = node.dataset?.latex;
    if (latex !== undefined) {
      out += node.dataset?.display ? `$$${latex}$$` : `$${latex}$`;
      continue;
    }
    if (node.tagName === "BR") {
      out += "\n";
      continue;
    }
    if (node.tagName === "DIV" || node.tagName === "P") {
      out += `\n${serializeEditorDom(node)}`;
      continue;
    }
    out += serializeEditorDom(node);
  }

  return out;
}

/**
 * 编辑区读回来的文本统一收尾。
 *
 * - 删掉一条公式会留下两个空格（`已知  递增`），压掉；
 * - 回车只该是「另起一行」，不该是空行 —— `remark-breaks` 下单换行就已经断行，
 *   多出来的空行只会把题干撑长。所以 `\n{2,}` 一律压成 `\n`。
 */
export function tidyEditedText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * 兜底：把挤成一行的题干按小问 / 选项拆行。
 *
 * 为什么需要它：`analyze.md` 要求「每个小问各自另起一行」，但模型偶尔整道题
 * 一行吐完 —— `其中 $a>0$(1)求 $f(x)$ 的单调区间;(2)若…`，学生得自己找小问的边界。
 *
 * 只在**整段一个换行都没有**时才动手：模型既然分了行就尊重它，
 * 免得把已经排好的版式又搅乱。
 *
 * 圈码 `①②③` 故意不拆：它在选择题里多半是选项内容（`A. ①②`），
 * 拆开会变成 `A.` / `①` / `②` 三行，比不拆更糟。
 */
export function normalizeProblemText(text: string): string {
  if (text.includes("\n")) return text;

  return text
    .replace(/\s*(?=[（(]\d{1,2}[）)])/g, "\n") // 小问：(1) （2）
    .replace(/([；;。\s])([A-D][.、．])/g, "$1\n$2") // 选项：A. B、 C．
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
