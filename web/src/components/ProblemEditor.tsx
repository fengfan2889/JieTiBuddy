import "katex/dist/katex.min.css";

import type { EditableNode } from "@/lib/latex";

import katex from "katex";
import { useEffect, useRef, useState } from "react";

import { splitProblemParts, serializeEditorDom, tidyEditedText } from "@/lib/latex";

/**
 * 题干编辑器 —— 让高中生能像改作文一样改题，而不是对着 `\frac{1}{a}` 发呆。
 *
 * 做法：把题干切成「文字」和「公式」两种片段。
 * - **文字**：普通可编辑文本，正常打字、换行、删改。
 * - **公式**：渲染成 KaTeX 小卡片（`contenteditable=false`），在编辑区里是**一整个原子** ——
 *   不会被光标切碎，也不会被误删半个。
 *   点它才弹出面板改这一条公式（面板里同时给大号渲染图做对照）。
 *
 * 存回去的格式仍是 `$...$` —— 数据库、提示词、后端全都当纯文本看，这里只是**编辑态的样子**变了。
 *
 * 为什么用 contenteditable 而不是「一堆输入框」：题干是图文混排的一句话
 * （`已知函数 $f(x)=…$ 与 $g(x)=…$，其中 $a>0$`），拆成一堆框会让人看不出这是一句话。
 * 代价是这个 div 由 DOM 自己管，React 只在挂载时灌一次内容，之后不再插手。
 */
export function ProblemEditor({
  value,
  onChange,
  onDone,
}: {
  /** 初始内容，只在挂载时读一次 */
  value: string;
  onChange: (next: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<{ el: HTMLElement; latex: string } | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.innerHTML = "";
    for (const part of splitProblemParts(value)) {
      if (part.type === "text") {
        part.value.split("\n").forEach((line, i) => {
          if (i > 0) el.appendChild(document.createElement("br"));
          el.appendChild(document.createTextNode(line));
        });
      } else {
        el.appendChild(makeChip(part.value, part.display));
      }
    }

    // 光标落到末尾，进来就能接着打
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // 只在挂载时灌一次；value 后续变化不该覆盖用户正在编辑的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    const el = ref.current;
    if (!el) return;
    onChange(tidyEditedText(serializeEditorDom(el as unknown as EditableNode)));
  }

  function onEditorClick(e: React.MouseEvent) {
    const hit = (e.target as HTMLElement).closest<HTMLElement>(".math-chip");
    if (hit) {
      e.preventDefault();
      const latex = hit.dataset.latex ?? "";
      setChip({ el: hit, latex });
      setDraft(latex);
      return;
    }
    setChip(null);
  }

  function applyChip() {
    if (!chip) return;
    const next = draft.trim();
    if (!next) return; // 想删就点「删掉这个公式」，避免留一个空壳
    chip.el.dataset.latex = next;
    paint(chip.el);
    setChip(null);
    commit();
  }

  function removeChip() {
    if (!chip) return;
    chip.el.remove();
    setChip(null);
    commit();
  }

  return (
    <div>
      <p className="mb-1.5 text-[12px] leading-relaxed text-amber-700">
        文字直接改就行。公式是独立的小卡片，点一下能单独改，不会被打字切碎。
      </p>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={commit}
        onClick={onEditorClick}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          }
        }}
        className="min-h-[4.5rem] rounded-xl border border-amber-300 bg-white p-3 text-[15px] leading-[2.1] text-slate-800 outline-none"
      />

      {chip && (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-slate-500">改这一条公式</span>
            <button
              type="button"
              onClick={() => setChip(null)}
              className="text-[12px] text-slate-400"
            >
              取消
            </button>
          </div>

          {/* 大号渲染图 —— 改之前先看清它本来长什么样 */}
          <div className="mb-2 overflow-x-auto rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
            <FormulaPreview latex={draft} />
          </div>

          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyChip();
              }
            }}
            spellCheck={false}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[13px] text-slate-800 outline-none focus:border-brand-300"
          />
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
            公式的写法，不用全懂：一般只需要改里面的数字和字母。上面的图会跟着变。
          </p>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={removeChip}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-rose-600 active:scale-[0.98]"
            >
              删掉这个公式
            </button>
            <button
              type="button"
              onClick={applyChip}
              className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white active:scale-[0.98]"
            >
              改好了
            </button>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[12px] text-slate-400">改完点右边就回到题目样子</span>
        <button
          type="button"
          onClick={() => {
            setChip(null);
            onDone();
          }}
          className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-[13px] font-medium text-white active:scale-[0.98]"
        >
          完成
        </button>
      </div>
    </div>
  );
}

/** 面板里的预览：公式写坏时不炸，直接显示红字提醒 */
function FormulaPreview({ latex }: { latex: string }) {
  const html = katex.renderToString(latex.trim() || "\\;", {
    throwOnError: false,
    displayMode: true,
    errorColor: "#e11d48",
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function makeChip(latex: string, display: boolean): HTMLElement {
  const span = document.createElement("span");
  span.className = "math-chip";
  span.contentEditable = "false";
  span.dataset.latex = latex;
  // 记住它原本是 `$$…$$` 还是 `$…$`，否则保存回去会把块级公式降级成行内
  if (display) span.dataset.display = "1";
  span.title = "点一下改这条公式";
  paint(span);
  return span;
}

function paint(span: HTMLElement) {
  span.innerHTML = katex.renderToString(span.dataset.latex ?? "", {
    // output: "html" —— 编辑区里不需要 MathML 语义副本，
    // 少一半 DOM，也顺手避免「复制出两份公式」
    output: "html",
    throwOnError: false,
  });
}

