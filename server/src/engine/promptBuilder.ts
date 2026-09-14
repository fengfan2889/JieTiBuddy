import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GuideMap, StepLadder, SupportLevel } from "../shared.js";
import { SUPPORT_LEVEL_LABEL } from "../shared.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = join(HERE, "..", "prompts");

const cache = new Map<string, string>();

/**
 * 读取提示词文件。
 *
 * 开发环境下**不缓存**：提示词是 .md，`tsx watch` 只盯 .ts/.js 的改动，
 * 改完 .md 不重启就读不到新内容 —— 调试提示词时最费时间的坑就是这个。
 * 生产环境缓存，省掉每轮一次磁盘读。
 */
const CACHE_PROMPTS = process.env.NODE_ENV === "production";

export async function loadPrompt(name: string): Promise<string> {
  if (CACHE_PROMPTS) {
    const hit = cache.get(name);
    if (hit) return hit;
  }

  const raw = await readFile(join(PROMPT_DIR, `${name}.md`), "utf8");
  const body = stripComments(raw);
  if (CACHE_PROMPTS) cache.set(name, body);
  return body;
}

export function clearPromptCache(): void {
  cache.clear();
}

/** 支持 `<!-- -->` 形式的编者注，避免它们被当成指令发给模型 */
function stripComments(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "").trim();
}

// ---------- 上下文拼装 ----------

export interface StudentContext {
  stepIndex: number;
  totalSteps: number;
  supportLevel: SupportLevel;
  currentRoute: string;
  turnCount: number;
  studentState: string | null;
}

/**
 * 每轮发给模型的「状态块」。
 * 只带当前步 + 该步阶梯 + 最近若干轮，不重发整张地图 —— 这是 R2（token 爆炸）的解法。
 */
export function buildStateBlock(map: GuideMap, ctx: StudentContext, recent: string): string {
  const route =
    ctx.currentRoute === "main"
      ? null
      : map.altRoutes.find((r) => r.name === ctx.currentRoute) ?? null;

  const step = map.steps.find((s) => s.index === ctx.stepIndex) ?? map.steps[0];

  const lines: string[] = [];
  lines.push("# 当前状态");
  lines.push(`- 进度：第 ${ctx.stepIndex} / ${ctx.totalSteps} 步`);
  lines.push(`- 支持强度：S${ctx.supportLevel}（${SUPPORT_LEVEL_LABEL[ctx.supportLevel]}）`);
  lines.push(`- 已进行轮次：${ctx.turnCount}`);
  if (ctx.studentState) lines.push(`- 上一轮判定：${ctx.studentState}`);
  if (route) lines.push(`- 当前走的是备选路径：${route.name}（${route.when}）`);

  if (step) {
    lines.push("");
    lines.push("# 当前这一步");
    lines.push(`- 目标：${step.goal}`);
    lines.push(`- 在考什么：${step.analysis}`);
    lines.push(`- 怎么下手：${step.approach}`);
    if (step.commonWrong) lines.push(`- 常见错误：${step.commonWrong}`);
    lines.push("");
    lines.push("# 本步可用的细化话术（供参考，不要照抄，要结合学生原话改写）");
    lines.push(formatLadder(step.ladder, ctx.supportLevel));
  }

  lines.push("");
  lines.push("# 最近对话");
  lines.push(recent || "（本题首轮，暂无对话）");

  return lines.join("\n");
}

function formatLadder(ladder: StepLadder, current: SupportLevel): string {
  if (current === 0) {
    return "- 当前是 S0：用「在考什么 + 怎么下手」讲清楚这一步，不要直接抄下面的话术。";
  }
  const own = current === 1 ? ladder.S1 : current === 2 ? ladder.S2 : ladder.S3;
  const lines = [`- 当前是 S${current}，本轮以这一档为准：${own}`];
  if (current < 3) {
    lines.push(`- 若学生仍无进展，下一档可升到：${current === 1 ? ladder.S2 : ladder.S3}`);
  }
  return lines.join("\n");
}

// ---------- 输出契约 ----------

/** 每轮模型必须返回的结构（给模型看的字段说明） */
export const OUTPUT_CONTRACT = `
# 输出格式（必须是严格 JSON，不要包裹任何解释文字）

{
  "student_state": "CORRECT | PARTIAL | WRONG | STUCK | OFF_TRACK | WANTS_ANSWER | ASK_WHY | SOLVED",
  "state_reason": "一句话说明你为什么这么判断（内部字段，不展示给学生）",
  "reply": "给学生看的正文，Markdown，公式用 $...$ 或 $$...$$",
  "support_level": 0,
  "step_index": 1,
  "step_goal": "当前这一步的目标（内部字段）",
  "quick_replies": ["再讲细一点", "为什么这么做"],
  "is_solved": false
}

字段规则：
- reply 是唯一展示给学生的内容，必须是中文口语，高中生听得懂。
- support_level 必须在 0~3，且相对上一轮**最多变动 1 级**，不得跳级。
- quick_replies 给 2~3 个，必须是学生下一句可能真会说的话，不要给「取消」「帮助」这类无关选项。
- 引导模式下 reply 中不得出现最终答案或最终数值结论。
`.trim();
