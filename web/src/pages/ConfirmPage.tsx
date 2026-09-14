import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { isNoApiKeyError } from "@/api/client";
import { patchProblem } from "@/api/problems";
import { createSession } from "@/api/sessions";
import { MathText } from "@/components/MathText";
import { ProblemEditor } from "@/components/ProblemEditor";
import { ProblemMeta } from "@/components/ProblemMeta";
import { normalizeProblemText } from "@/lib/latex";
import { useConfigStatus } from "@/features/config/useConfigStatus";
import { useAppStore } from "@/store/app";

const LOW_CONFIDENCE = 0.8;

export function ConfirmPage() {
  const nav = useNavigate();
  const problem = useAppStore((s) => s.problem);
  const setProblem = useAppStore((s) => s.setProblem);
  const setSession = useAppStore((s) => s.setSession);
  const imagePreview = useAppStore((s) => s.imagePreview);

  const [text, setText] = useState(problem?.ocrText ?? "");
  /** 题干区默认显示渲染后的题目（一眼能核对识别对不对），点一下才进编辑态（D22） */
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"guide" | "direct" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 识别得准不准，跟「谁读的图」直接相关 —— 把模型名摆在这张图旁边 */
  const { status } = useConfigStatus();

  useEffect(() => {
    if (!problem) nav("/", { replace: true });
  }, [problem, nav]);

  if (!problem) return null;

  const lowConfidence = problem.ocrConfidence < LOW_CONFIDENCE;

  async function start(mode: "guide" | "direct") {
    if (!problem || busy) return;
    setBusy(mode);
    setError(null);
    try {
      // 学生改过识别文本就先落库，后面的地图与分析都基于修正后的题干
      if (text.trim() && text.trim() !== problem.ocrText) {
        const { problem: updated } = await patchProblem(problem.id, {
          ocrText: text.trim(),
          ocrConfirmed: true,
        });
        setProblem(updated);
      } else {
        const { problem: updated } = await patchProblem(problem.id, { ocrConfirmed: true });
        setProblem(updated);
      }

      const { session } = await createSession(problem.id, mode);
      setSession(session);
      nav(`/solve/${session.id}`, { replace: true });
    } catch (err) {
      // 这一刻才想起没配密钥也别慌，带人去设置页
      if (isNoApiKeyError(err)) {
        nav("/settings");
        return;
      }
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => nav("/", { replace: true })}
          className="text-[14px] text-slate-500"
        >
          返回
        </button>
        <h1 className="text-[15px] font-medium text-slate-800">确认一下题目</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {imagePreview && (
          <img
            src={imagePreview}
            alt="题目原图"
            className="mb-4 max-h-40 w-full rounded-xl object-contain ring-1 ring-slate-200"
          />
        )}

        {lowConfidence && (
          <div className="mb-3 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
            这张图我认得不太准（把握 {Math.round(problem.ocrConfidence * 100)}%），
            请你核对一下下面的题干，有错就直接改。
          </div>
        )}

        {/*
          题干只有一块：默认就是**渲染态**（公式、换行都排好，跟以前那个「预览」长得一模一样），
          点一下才进入编辑态。

          🔴 编辑态**不是**把 LaTeX 原文摆进 textarea —— 用这个 App 的是高中生，
          让他对着 `$f(x)=x-\frac{1}{a}\ln x$` 改错字等于不让他改（用户原话：
          "编辑的时候也应该是正常的编辑，高中生用 latex 不太合适"）。
          所以编辑态走 `ProblemEditor`：文字正常打字，公式是一张张渲染好的小卡片。
        */}
        <section className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-slate-500">题干</h2>
            <span className="text-[12px] text-slate-300">
              {editing ? "按 Esc 或点「完成」回到题目样子" : "点一下可以改识别错的字"}
            </span>
          </div>

          {editing ? (
            <ProblemEditor
              value={text}
              onChange={setText}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="点一下修改识别出的题干文字"
              onClick={() => setEditing(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditing(true);
                }
              }}
              className="min-h-[3rem] cursor-text rounded-xl px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {text.trim() ? (
                <MathText content={normalizeProblemText(text)} />
              ) : (
                <span className="text-[14px] text-slate-400">（题干是空的，点一下填上）</span>
              )}
            </div>
          )}
        </section>

        {/* 学科 / 难度 / 年级 / 知识点 / 读题模型 —— 与解题页共用同一组件（D24） */}
        <ProblemMeta
          problem={problem}
          vlModel={status?.vlModel}
          wrap
          className="mt-3"
        />

        {/*
          「识别到的公式」区块已删除：它列的 `ocr_latex` 每一项在题干里都已经
          完整渲染过了，属于同一份信息看两遍；模型给的数组还常有重复项
          （实测同一道题里 "y=f(x)" 出现两次），列出来只会让人以为识别重了。
        */}

        {error && <p className="mt-3 text-[13px] text-rose-600">{error}</p>}
      </div>

      <div className="border-t border-slate-200 bg-white px-4 pb-6 pt-3">
        <p className="mb-2.5 text-center text-[12.5px] text-slate-400">想怎么解这道题？</p>
        {/*
          两个按钮都拦掉 mousedown 的默认行为：题干正在编辑时先别让 textarea 失焦 ——
          失焦会立刻重渲染，按钮位置一变，这一下点击就落空了（表现为"点了没反应"）
        */}
        <div className="flex gap-3">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void start("direct")}
            disabled={busy !== null}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-[14.5px] text-slate-600 active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "direct" ? "生成中…" : "直接看答案"}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void start("guide")}
            disabled={busy !== null}
            className="flex-[1.5] rounded-xl bg-brand-600 py-3 text-[14.5px] font-medium text-white active:scale-[0.98] disabled:opacity-60"
          >
            {busy === "guide" ? "老师正在备课…" : "引导我解"}
          </button>
        </div>
        {busy === "guide" && (
          <p className="mt-2.5 text-center text-[12px] text-slate-400">
            正在规划这道题的讲解路线，稍等几秒
          </p>
        )}
      </div>
    </div>
  );
}
