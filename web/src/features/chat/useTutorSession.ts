import type {
  MessageContentType,
  MetaEvent,
  QuickAction,
  StudentState,
  SupportLevel,
} from "@jtb/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { fetchSession, finalizeSession, sendHint, sendMessage, startSession } from "@/api/sessions";

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** `summary` = 整份解析，界面按「解析卡」整幅展示，而不是塞进对话气泡 */
  contentType?: MessageContentType;
  state?: StudentState | null;
  supportLevel?: SupportLevel | null;
  streaming?: boolean;
}

/**
 * 引导会话的前端状态机。
 *
 * 关键设计：
 * - 正文由 SSE 的 delta 逐块追加；meta（状态徽标、进度、快捷按钮、首轮阶梯）
 *   先于正文到达，所以徽标与按钮会先于文字出现。
 * - ready 门闩：必须等历史载入完才允许发首轮，否则"刷新页面"会把已有会话
 *   再启动一次，凭空多出一条引导。
 */
export function useTutorSession(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [meta, setMeta] = useState<MetaEvent | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSolved, setIsSolved] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;

    setReady(false);
    setLoading(true);
    startedRef.current = false;

    fetchSession(sessionId)
      .then((res) => {
        if (!alive) return;
        setMessages(
          res.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            contentType: m.contentType,
            state: m.state,
            supportLevel: m.supportLevel,
          })),
        );
        setMeta({
          mode: res.session.mode,
          state: res.session.studentState ?? "PARTIAL",
          supportLevel: res.session.supportLevel,
          stepIndex: res.session.stepIndex,
          totalSteps: res.session.guideMap?.steps.length ?? 1,
          stepGoal: "",
          routePreview: null,
          stepLadder: null,
          canSwitchRoute: false,
          quickReplies: [],
        });
        setIsSolved(res.session.status === "solved");
        // 已有对话记录 → 不再自动触发首轮
        startedRef.current = res.messages.length > 0;
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(toMessage(err));
        /**
         * 🔴 取不到历史时**绝不自动开跑**。
         *
         * `ready` 在 `finally` 里无条件置真，而自动首轮的门闩是 `startedRef`；
         * 少了这一行，一次加载失败（比如后端正在重启）就会让门闩保持 false，
         * 于是页面"重新开始"一遍 —— guide 模式多一轮引导，direct 模式**多生成一份完整解析**
         * （实测一次 30~90 秒 + 一整份 token）。库里那条会话攒了 4 份解析就是这么来的。
         * 状态未知时宁可什么都不做，让用户自己重试。
         */
        startedRef.current = true;
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          setReady(true);
        }
      });

    return () => {
      alive = false;
    };
  }, [sessionId]);

  const runStream = useCallback(
    async (
      runner: (
        handlers: {
          onMeta: (m: MetaEvent) => void;
          onDelta: (t: string) => void;
          onDone: () => void;
        },
        signal: AbortSignal,
      ) => Promise<void>,
      options: { appendUser?: string },
    ) => {
      setError(null);
      setStreaming(true);

      const assistantId = `local_a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        ...(options.appendUser
          ? [
              {
                id: `local_u_${Date.now()}`,
                role: "user" as const,
                content: options.appendUser,
              },
            ]
          : []),
        { id: assistantId, role: "assistant" as const, content: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await runner(
          {
            onMeta: (m) => setMeta(m),
            onDelta: (text) =>
              setMessages((prev) =>
                prev.map((x) => (x.id === assistantId ? { ...x, content: x.content + text } : x)),
              ),
            onDone: () =>
              setMessages((prev) =>
                prev.map((x) => (x.id === assistantId ? { ...x, streaming: false } : x)),
              ),
          },
          controller.signal,
        );
      } catch (err) {
        setError(toMessage(err));
        // 失败的占位消息直接撤掉，别留一条空气泡
        setMessages((prev) => prev.filter((x) => x.id !== assistantId));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  /** 首轮：路径预告 + 第一步引导 */
  const start = useCallback(async () => {
    if (!sessionId || !ready || startedRef.current) return;
    startedRef.current = true;
    await runStream((handlers, signal) => startSession(sessionId, handlers, signal), {});
  }, [sessionId, ready, runStream]);

  const send = useCallback(
    async (content: string, action?: QuickAction) => {
      if (!sessionId || streaming) return;
      await runStream(
        (handlers, signal) => sendMessage(sessionId, content, handlers, action, signal),
        action ? {} : { appendUser: content },
      );
    },
    [sessionId, streaming, runStream],
  );

  const hint = useCallback(
    async (action: QuickAction) => {
      if (!sessionId || streaming) return;
      await runStream((handlers, signal) => sendHint(sessionId, action, handlers, signal), {});
    },
    [sessionId, streaming, runStream],
  );

  /** 看完整解析：此时学生已自行解出，属于复盘而非代答，所以直接整段给出 */
  const showAnswer = useCallback(async () => {
    if (!sessionId || streaming) return;
    setStreaming(true);
    setError(null);
    try {
      const { text } = await finalizeSession(sessionId);
      setMessages((prev) => [
        ...prev,
        {
          id: `m_summary_${Date.now()}`,
          role: "assistant",
          content: text,
          contentType: "summary",
        },
      ]);
      setIsSolved(true);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setStreaming(false);
    }
  }, [sessionId, streaming]);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return {
    messages,
    meta,
    streaming,
    loading,
    ready,
    error,
    isSolved,
    start,
    send,
    hint,
    showAnswer,
    abort,
  };
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "出了点问题，再试一次";
}
