/**
 * 前后端共享类型。唯一事实来源 —— 改这里，两端同时生效。
 */

// ---------- 枚举 ----------

export type Subject = "math" | "physics" | "chemistry" | "other";

/** 解题模式：guide = 引导式（不给答案）；direct = 直接看答案 */
export type SessionMode = "guide" | "direct";

export type SessionStatus = "active" | "solved" | "abandoned";

/**
 * 学生状态。ASK_WHY 是「问为什么这么做」——
 * 必须正面回答，禁止把问题反问回去。
 */
export type StudentState =
  | "CORRECT"
  | "PARTIAL"
  | "WRONG"
  | "STUCK"
  | "OFF_TRACK"
  | "WANTS_ANSWER"
  | "ASK_WHY"
  | "SOLVED";

/**
 * 支持强度。注意：升档 = 更具体，不是「更接近答案」。
 * 0 是默认档且必须给足，不允许出现「什么都不给」的空档。
 */
export type SupportLevel = 0 | 1 | 2 | 3;

export type MessageRole = "user" | "assistant";

export type MessageContentType = "text" | "image" | "hint" | "feedback" | "summary";

/** 快捷动作 */
export type QuickAction =
  | "MORE_DETAIL" // 再讲细一点
  | "ASK_WHY" // 为什么这么做
  | "EXPLAIN_THIS_STEP" // 直接讲这一步
  | "SWITCH_ROUTE" // 换个思路试试
  | "THINK_MORE" // 我自己再想想（纯前端，不发请求）
  | "SHOW_ANSWER"; // 看完整解析（仅 direct 模式 / 收尾）

// ---------- 引导地图（Guide Map，D10 / D11）----------

/**
 * 每一步预置的细化话术。S0 不给在此处 —— S0 = analysis + approach，
 * 由模型每轮结合学生原话现场改写，避免机械重复。
 */
export interface StepLadder {
  S1: string; // 思路 + 具体方法（用哪个公式、怎么套）
  S2: string; // 方法 + 算式结构（式子摆好，只留最后一步给他算）
  S3: string; // 单步演示当前这一步（仍不给最终答案）
}

export interface GuideStep {
  index: number;
  /** 这一步要达成的目标（可展示） */
  goal: string;
  /** 【必填】这步在考什么、为什么要这么做 —— S0 的核心素材 */
  analysis: string;
  /** 【必填】该怎么下手 —— S0 的核心素材 */
  approach: string;
  ladder: StepLadder;
  /** 这一步最常见的错误 */
  commonWrong?: string;
}

export interface AltRoute {
  name: string;
  /** 什么情况下换到这条路径 */
  when: string;
  steps: string[];
}

export interface GuideMap {
  steps: GuideStep[];
  /** 路径预告：只说「怎么走」，不说「怎么做」，仅首轮展示一次 */
  routePreview: string;
  altRoutes: AltRoute[];
  /** 易错点预判，收尾报告用 */
  pitfalls: string[];
}

// ---------- 实体 ----------

export interface Problem {
  id: string;
  imagePath: string | null;
  ocrText: string;
  ocrLatex: string[];
  ocrConfirmed: boolean;
  ocrConfidence: number;
  subject: Subject;
  gradeHint: string;
  difficulty: number;
  knowledgePoints: string[];
  createdAt: number;
}

/** 对外的会话视图 —— 注意：没有 internalAnswer 字段，永不返回 */
export interface Session {
  id: string;
  problemId: string;
  mode: SessionMode;
  status: SessionStatus;
  supportLevel: SupportLevel;
  studentState: StudentState | null;
  stepIndex: number;
  currentRoute: string;
  /** 仅 guide 模式、且已生成时返回 */
  guideMap?: GuideMap;
  createdAt: number;
  finishedAt: number | null;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  contentType: MessageContentType;
  content: string;
  state: StudentState | null;
  supportLevel: SupportLevel | null;
  createdAt: number;
}

// ---------- 请求 / 响应 ----------

export interface CreateProblemResponse {
  problem: Problem;
}

export interface AnalyzeResponse {
  problem: Problem;
  guideMap: GuideMap;
}

export interface CreateSessionRequest {
  problemId: string;
  mode: SessionMode;
}

export interface SendMessageRequest {
  content: string;
  /** 快捷动作，普通文字输入时留空 */
  action?: QuickAction;
}

export interface SendHintRequest {
  action: QuickAction;
}

/** SSE meta 事件 —— 先于正文下发，前端据此先渲染徽标与按钮 */
export interface MetaEvent {
  /** direct 模式下前端不渲染进度条、快捷按钮与引导类 UI */
  mode: SessionMode;
  state: StudentState;
  supportLevel: SupportLevel;
  stepIndex: number;
  totalSteps: number;
  stepGoal: string;
  /** 仅首轮非 null */
  routePreview: string | null;
  /** 仅首轮下发当前步的 S1~S3 */
  stepLadder: StepLadder | null;
  /** true 时前端展示「换个思路试试」 */
  canSwitchRoute: boolean;
  quickReplies: string[];
}

export interface DoneEvent {
  messageId: string;
  isSolved: boolean;
  /** 命中空泛话术黑名单并触发降级时为 true（调试用） */
  degraded?: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

// ---------- 运行时配置（设置页：接入 AI 模型）----------

/**
 * 模型公司。与 server/src/providers/catalog.ts 的注册表一一对应 ——
 * 新增一家公司只需要加一条记录，前后端都不用改逻辑。
 */
export type LlmProviderName = "qwen" | "deepseek";

/**
 * 模型在一次任务里扮演的角色。
 * 读题要「看得见图」（视觉理解），解题只要「会写字」（文本生成）——
 * 这是两个不同的能力位，所以设置页给两个下拉，而不是一个。
 */
export type ModelRole = "vl" | "text";

export interface ModelOption {
  /** 传给模型接口的 model 名，如 qwen3.8-max */
  id: string;
  /** 给用户看的友好名，接口拿不到时回落成 id */
  label: string;
  /** 支持图片输入。读题模型必须为 true */
  vision: boolean;
  /** 官方推荐：不知道该选哪个时照这个来 */
  recommended: boolean;
  /** 一句话说明（价格 / 定位），拿不到就不显示 */
  note?: string;
}

export interface ModelCatalog {
  provider: LlmProviderName;
  /** remote = 调供应商接口拿到的；fallback = 接口不可用时的内置候选 */
  source: "remote" | "fallback";
  /** 回退原因，直接展示给用户 —— 不说的话他会以为列表就这么点 */
  message?: string;
  /** 可用于读题的模型（vision 全为 true） */
  vl: ModelOption[];
  /** 可用于解题的对话模型（含视觉模型，它们也能写字） */
  text: ModelOption[];
}

export interface ProviderInfo {
  id: LlmProviderName;
  label: string;
  /** 申请密钥的控制台地址 */
  consoleUrl: string;
  /** 密钥输入框的占位提示 */
  keyPlaceholder: string;
  configured: boolean;
  masked: string;
  /** 这家公司生效的读题 / 解题模型 */
  vlModel: string;
  textModel: string;
}

export interface ConfigStatus {
  /** 当前选中的模型公司 */
  provider: LlmProviderName;
  /** 当前这家公司是否已有可用的密钥 */
  configured: boolean;
  /** 脱敏展示，如 sk-abc****wxyz；未配置时为空串 */
  masked: string;
  /** 密钥是否已回写到 server/.env（写盘失败时为 false，只在本进程内生效） */
  persisted: boolean;
  /** 当前生效的读题 / 解题模型 */
  vlModel: string;
  textModel: string;
  consoleUrl: string;
  /** 下拉里的全部公司（带各自的密钥状态，切过去不用再发一次请求） */
  providers: ProviderInfo[];
}

/** 局部更新：只传要改的字段。一次 PUT 里给多个字段时按「校验全部 → 再逐项应用」处理 */
export interface SaveConfigRequest {
  provider?: LlmProviderName;
  /** 写到 provider 指定的那家公司；不指定则写当前这家 */
  apiKey?: string;
  vlModel?: string;
  textModel?: string;
}

export interface VerifyApiKeyResult {
  ok: boolean;
  /** 给用户看的可读结论，失败时说明下一步怎么办 */
  message: string;
  latencyMs?: number;
}
