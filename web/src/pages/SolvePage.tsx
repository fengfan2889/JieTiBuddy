import type { Problem, QuickAction } from "@jtb/shared";
import { SUBJECT_LABEL } from "@jtb/shared";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { fetchProblem } from "@/api/problems";
import { fetchSession } from "@/api/sessions";
import { ChatBubble } from "@/components/ChatBubble";
import { MathText } from "@/components/MathText";
import { ModelTag } from "@/components/ModelTag";
import { ProblemMeta } from "@/components/ProblemMeta";
import { useConfigStatus } from "@/features/config/useConfigStatus";
import { normalizeProblemText } from "@/lib/latex";
import { QuickActions } from "@/components/QuickActions";
import { StepProgress } from "@/components/StepProgress";
import { useTutorSession } from "@/features/chat/useTutorSession";
import { useAppStore } from "@/store/app";

export function SolvePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const nav = useNavigate();

  const storeProblem = useAppStore((s) => s.problem);
  const [problem, setProblem] = useState<Problem | null>(storeProblem);
  const [input, setInput] = useState("");

  const { messages, meta, streaming, ready, error, isSolved, start, send, hint, showAnswer } =
    useTutorSession(sessionId ?? null);

  /**
   * 直接模式没有步子、没有提示阶梯、没有引导动作。
   * 它只需要把答案与解析摆出来 —— 所以整块引导 UI（进度条、快捷按钮、看解析按钮）都隐藏。
   */
  const isDirect = meta?.mode === "direct";

  /** 正在作答的是哪个模型 —— 摆出来，回答得不好时不用翻设置页 */
  const { status } = useConfigStatus();

  const scrollRef = useRef<HTMLDivElement>(null);

  // 刷新页面 / 从历史页进来时 store 是空的，回头去取题干
  useEffect(() => {
    if (problem || !sessionId) return;
    let alive = true;
    fetchSession(sessionId)
      .then((res) => fetchProblem(res.session.problemId))
      .then((res) => {
        if (alive) setProblem(res.problem);
      })
      .catch(() => {
        /* 题干取不到不影响解题，静默降级 */
      });
    return () => {
      alive = false;
    };
  }, [problem, sessionId]);

  useEffect(() => {
    if (ready) void start();
  }, [ready, start]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function submit() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    await send(text);
  }

  async function onAction(action: QuickAction) {
    if (streaming) return;
    if (action === "THINK_MORE") return; // 纯前端，不发请求
    if (action === "SHOW_ANSWER") {
      await showAnswer();
      return;
    }
    await hint(action);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => nav("/", { replace: true })}
            className="text-[14px] text-slate-500"
          >
            返回
          </button>
          <h1 className="flex-1 truncate text-[15px] font-medium text-slate-800">
            {problem ? SUBJECT_LABEL[problem.subject] : "解题中"}
          </h1>
          {status && <ModelTag role="解题" name={status.textModel} className="shrink-0" />}
          {isDirect && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] text-slate-500">
              直接看答案
            </span>
          )}
        </div>

        {/*
          题目元信息在**解题/分析全程**都要摆着（D24）：
          「这一步为什么这么走」本来就挂在难度、年级和知识点上 —— 讲着讲着把这些收起来，
          学生就只能靠记忆对号。学科已在标题里，不再重复。
          单行横滑：头部的每一像素都要留给题干和对话区。
        */}
        {problem && (
          <ProblemMeta
            problem={problem}
            vlModel={status?.vlModel}
            hideSubject
            className="border-t border-slate-100 bg-white px-4 py-2"
          />
        )}

        {/* 题干常驻显示：解题全程都要能一眼看到题，不该藏在按钮后面 */}
        {problem && (
          <div className="max-h-44 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-3">
            <MathText
              content={problem.ocrText ? normalizeProblemText(problem.ocrText) : "_（题干为空）_"}
            />
          </div>
        )}

        {meta && !isDirect && (
          <StepProgress
            stepIndex={meta.stepIndex}
            totalSteps={meta.totalSteps}
            stepGoal={meta.stepGoal}
          />
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-12 text-center text-[13.5px] text-slate-400">
            {isDirect ? "正在解答这道题…" : "老师正在读题、规划讲解路线…"}
          </p>
        )}
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            answer={isDirect || m.contentType === "summary"}
          />
        ))}

        {isSolved && !isDirect && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => void showAnswer()}
              disabled={streaming}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-[14px] text-slate-700 active:scale-[0.99] disabled:opacity-50"
            >
              看完整解析与知识点总结
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-inset ring-rose-200">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-3 pb-5 pt-2.5">
        {!isDirect && (
          <QuickActions
            suggestions={meta?.quickReplies ?? []}
            disabled={streaming}
            canSwitchRoute={meta?.canSwitchRoute}
            onAction={(a) => void onAction(a)}
            onText={(t) => void send(t)}
          />
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={
              isDirect ? "哪一步没看懂？直接问…" : "说说你的想法，哪一步都行…"
            }
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 outline-none focus:border-brand-300 focus:bg-white"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={streaming || !input.trim()}
            className="h-[42px] shrink-0 rounded-xl bg-brand-600 px-4 text-[14.5px] font-medium text-white active:scale-[0.97] disabled:opacity-40"
          >
            {streaming ? "…" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
