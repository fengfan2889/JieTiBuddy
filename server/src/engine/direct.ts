import type { MetaEvent } from "../shared.js";
import { SUBJECT_LABEL } from "../shared.js";

import { appendMessage, getProblem, getSessionInternal, listMessages, updateSession } from "../db/repo.js";
import { now } from "../lib/util.js";
import { getProvider, textModel } from "../providers/index.js";
import type { TurnResult } from "./tutorEngine.js";
import { NotFoundError } from "./tutorEngine.js";
import { loadPrompt } from "./promptBuilder.js";

/**
 * 直接模式（学生选了「直接看答案」）。
 *
 * 为什么单独一条链路，而不是复用 tutorEngine：
 * 引导模式的红线是「绝不给出最终答案」，直接模式的红线正相反 ——
 * 「必须给出答案，且不得夹带引导式反问」。
 * 两条链路的约束互斥，硬塞进一个 runTurn 只会让 prompt 里全是 if。
 *
 * 直接模式没有引导地图、没有步子进度、没有快捷动作，一次性给出答案与解析。
 */

/** 追问时最多回带多少字的历史解析 —— 够模型理解上下文，又不至于把 prompt 撑爆 */
const CONTEXT_LIMIT = 4000;

/**
 * @param userText 传 null 表示首轮（尚未提问）；传学生原话表示追问。
 */
export async function directTurn(
  sessionId: string,
  userText: string | null,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const session = getSessionInternal(sessionId);
  if (!session) throw new NotFoundError("会话不存在");
  const problem = getProblem(session.problemId);
  if (!problem) throw new NotFoundError("题目不存在");

  const isFirst = userText === null;
  const question = (userText ?? "").trim();

  if (!isFirst && question) {
    appendMessage({ sessionId, role: "user", content: question });
  }

  const system = await loadPrompt("answer");
  const lines: string[] = [
    "# 题目",
    problem.ocrText || "（题干为空）",
    "",
    "# 题目信息",
    `- 学科：${SUBJECT_LABEL[problem.subject]}`,
    `- 难度：${problem.difficulty}/5`,
    `- 知识点：${problem.knowledgePoints.join("、") || "未标注"}`,
  ];

  if (isFirst) {
    lines.push(
      "",
      "# 本轮任务",
      "学生刚拍了这道题并选择「直接看答案」。请给出答案与完整解析。",
    );
  } else {
    lines.push(
      "",
      "# 你已经给过的解析",
      priorAnswer(sessionId) || "（无）",
      "",
      "# 学生本轮的追问",
      question,
      "",
      "# 本轮任务",
      "只回答学生问的这个点。不要反问，不要让他自己再想想。",
    );
  }

  // 温度略低于引导模式：直接给答案时，准确性优先于表达多样
  const text = (
    await getProvider().chat(
      [
        { role: "system", content: system },
        { role: "user", content: lines.join("\n") },
      ],
      { model: textModel(), temperature: 0.3, signal },
    )
  ).trim();

  const message = appendMessage({
    sessionId,
    role: "assistant",
    content: text,
    contentType: isFirst ? "summary" : "feedback",
    state: "SOLVED",
    supportLevel: 0,
  });

  // 直接模式下首轮即已给出答案，会话当场结束，不留在「进行中」
  updateSession(sessionId, {
    status: "solved",
    studentState: "SOLVED",
    stepIndex: 1,
    finishedAt: now(),
  });

  return {
    meta: directMeta(),
    text,
    degraded: false,
    isSolved: true,
    messageId: message.id,
  };
}

/** 直接模式没有「第几步」的概念，进度与快捷按钮一律置空，由前端整块隐藏 */
function directMeta(): MetaEvent {
  return {
    mode: "direct",
    state: "SOLVED",
    supportLevel: 0,
    stepIndex: 1,
    totalSteps: 1,
    stepGoal: "",
    routePreview: null,
    stepLadder: null,
    canSwitchRoute: false,
    quickReplies: [],
  };
}

/** 取最近一条助手回复作为追问的上下文 */
function priorAnswer(sessionId: string): string {
  const history = listMessages(sessionId);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m && m.role === "assistant") {
      return m.content.length > CONTEXT_LIMIT
        ? `${m.content.slice(0, CONTEXT_LIMIT)}…（后略）`
        : m.content;
    }
  }
  return "";
}
