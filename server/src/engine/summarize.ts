import { SUBJECT_LABEL } from "../shared.js";

import { appendMessage, getProblem, getSessionInternal, listMessages, updateSession } from "../db/repo.js";
import { now } from "../lib/util.js";
import { getProvider, textModel } from "../providers/index.js";
import { loadPrompt } from "./promptBuilder.js";
import { NotFoundError } from "./tutorEngine.js";

/**
 * 收尾：完整解析 + 知识点总结 + 易错点。
 * 进入时机：is_solved = true，或轮次超过上限（P3 兜底）。
 */
export async function finalizeSession(sessionId: string, signal?: AbortSignal): Promise<string> {
  const session = getSessionInternal(sessionId);
  if (!session) throw new NotFoundError("会话不存在");
  const problem = getProblem(session.problemId);
  if (!problem) throw new NotFoundError("题目不存在");

  const history = listMessages(sessionId);
  const transcript =
    history.length > 0
      ? history
          .map((m) => `${m.role === "user" ? "学生" : "老师"}：${m.content}`)
          .join("\n\n")
      : "（本次没有对话记录）";

  const system = await loadPrompt("summarize");
  const user = [
    "# 题目",
    problem.ocrText || "（题干为空）",
    "",
    "# 题目信息",
    `- 学科：${SUBJECT_LABEL[problem.subject]}`,
    `- 难度：${problem.difficulty}/5`,
    `- 知识点：${problem.knowledgePoints.join("、") || "未标注"}`,
    "",
    "# 标准答案（用于核对，注意学生可能自己算出了不同形式的正确结果）",
    session.internalAnswer || "（未记录，请自行推导）",
    "",
    "# 本次对话记录",
    transcript,
  ].join("\n");

  const text = await getProvider().chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { model: textModel(), temperature: 0.4, signal },
  );

  appendMessage({
    sessionId,
    role: "assistant",
    content: text,
    contentType: "summary",
    state: "SOLVED",
    supportLevel: session.supportLevel,
  });

  updateSession(sessionId, {
    status: "solved",
    studentState: "SOLVED",
    finishedAt: now(),
  });

  return text;
}
