import type { QuickAction, StudentState, Subject, SupportLevel } from "./types.js";

export const SUBJECTS: readonly Subject[] = ["math", "physics", "chemistry", "other"] as const;

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: "数学",
  physics: "物理",
  chemistry: "化学",
  other: "其他",
};

export const STUDENT_STATES: readonly StudentState[] = [
  "CORRECT",
  "PARTIAL",
  "WRONG",
  "STUCK",
  "OFF_TRACK",
  "WANTS_ANSWER",
  "ASK_WHY",
  "SOLVED",
] as const;

/** 支持强度说明。用于提示词拼装与前端 tooltip，杜绝「强度=信息量」的误用。 */
export const SUPPORT_LEVEL_LABEL: Record<SupportLevel, string> = {
  0: "分析 + 思路",
  1: "思路 + 具体方法",
  2: "方法 + 算式结构",
  3: "单步演示（当前这一步）",
};

/** 快捷动作 → 中文按钮文案 */
export const QUICK_ACTION_LABEL: Record<QuickAction, string> = {
  MORE_DETAIL: "再讲细一点",
  ASK_WHY: "为什么这么做",
  EXPLAIN_THIS_STEP: "直接讲这一步",
  SWITCH_ROUTE: "换个思路试试",
  THINK_MORE: "我自己再想想",
  SHOW_ANSWER: "看完整解析",
};

export const DEFAULT_QUICK_REPLIES = ["再讲细一点", "为什么这么做", "我自己再想想"] as const;

/**
 * 空泛话术黑名单（R11 —— 本项目最致命的产品风险）。
 * 命中即重生成，仍命中则降级为当前步 analysis + approach 的模板拼接。
 * 只用于后置校验，不暴露给模型（避免它学会绕过）。
 */
export const VAGUE_PATTERNS: readonly RegExp[] = [
  /再(好好)?想(一)?想/,
  /再思考一下/,
  /仔细(读|看)(一)?(读|看)?(题|题目)/,
  /先自己(试试|想一想)/,
  /动动(脑|脑筋)/,
  /认真(审题|读题)/,
  /你觉得呢[？?]?$/,
  /你认为呢[？?]?$/,
  /^加油[！!]?$/,
  /^相信你[！!]?$/,
  /试试看吧/,
] as const;

/**
 * 答案泄露模式（T7 后置正则校验）。
 * 只收高置信度模式 —— 宁可漏检也不能误伤正常引导
 * （例如「你说的 x = 3 是对的」是合理反馈，不该判为泄露）。
 */
export const ANSWER_LEAK_PATTERNS: readonly RegExp[] = [
  /答案(是|为|就是)/,
  /正确答案/,
  /最终(结果|答案)/,
  /本题(答案|选)/,
  /所以.{0,6}(答案|结果)/,
  /应(该)?(选|为)\s*[A-D]/,
  /选\s*[ABCD][。．,，\s]?/,
] as const;

/** 单题引导轮次上限，超过则转「完整解析 + 薄弱知识点定位」（P3） */
export const MAX_GUIDE_TURNS = 12;

/** 连续同类错误 / 卡住达到该次数则触发换路径（alt_routes） */
export const ROUTE_SWITCH_THRESHOLD = 2;

/** 首轮必须给出的最小信息量校验阈值（T18） */
export const MIN_FIRST_REPLY_LENGTH = 60;
