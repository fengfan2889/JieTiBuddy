import type { LlmProviderName, ModelOption } from "../shared.js";

/**
 * 模型公司注册表 —— 这个文件是「支持哪几家、各自怎么接」的唯一事实来源。
 *
 * 加一家公司 = 加一条记录 + 在 shared 的 LlmProviderName 里加上它的 id，
 * 路由、设置页、Provider 工厂都不用动。UI 上的「模型公司」下拉直接读这份列表。
 */
export interface ProviderSpec {
  id: LlmProviderName;
  label: string;
  /** OpenAI 兼容协议的接入地址（不带结尾斜杠） */
  baseUrl: string;
  /** 密钥在 .env 里的变量名 */
  keyEnv: string;
  /** 申请密钥的控制台地址 */
  consoleUrl: string;
  keyPlaceholder: string;
  /** 读题 / 解题模型在 .env 里的变量名 */
  vlEnv: string;
  textEnv: string;
  /** 默认读题 / 解题模型 */
  defaultVl: string;
  defaultText: string;
  /**
   * 拉模型列表的方式：
   * - `openai`：GET /models，OpenAI 兼容的标准返回
   * - `dashscope`：百炼原生接口，要多翻几页，但**带能力标记**（VU=视觉理解），
   *   只有它能区分「这个模型能不能看图」
   */
  listMode: "openai" | "dashscope";
  /** 接口不可用、或还没填密钥时的内置候选 */
  fallback: ModelOption[];
  /** 推荐序 —— 从上往下取第一个「候选里真的有」的当作推荐项 */
  preferVl: string[];
  preferText: string[];
}

export const PROVIDERS: Record<LlmProviderName, ProviderSpec> = {
  qwen: {
    id: "qwen",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyEnv: "DASHSCOPE_API_KEY",
    consoleUrl: "https://bailian.console.aliyun.com/",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    vlEnv: "QWEN_VL_MODEL",
    textEnv: "QWEN_TEXT_MODEL",
    // 读题是「OCR + 归类」，不需要强推理 —— 快和便宜比聪明更重要（每次拍照都要跑）
    defaultVl: "qwen-vl-max",
    defaultText: "qwen3.7-plus",
    listMode: "dashscope",
    fallback: [
      { id: "qwen-vl-max", label: "Qwen-VL-Max", vision: true, recommended: true, note: "读题默认：专用 VL，快且省" },
      { id: "qwen3-vl-plus", label: "Qwen3-VL-Plus", vision: true, recommended: false, note: "新一代视觉专用，公式最规范" },
      { id: "qwen3.8-max", label: "Qwen3.8-Max", vision: true, recommended: false, note: "通用旗舰，读图偏慢偏贵" },
      { id: "qwen3.7-plus", label: "Qwen3.7-Plus", vision: true, recommended: false, note: "均衡，日常够用" },
      { id: "qwen3.8-flash", label: "Qwen3.8-Flash", vision: true, recommended: false, note: "更快更省" },
      { id: "qwen-plus", label: "Qwen-Plus", vision: false, recommended: false },
    ],
    preferVl: ["qwen-vl-max", "qwen3-vl-plus", "qwen3.8-max", "qwen3.7-plus"],
    preferText: ["qwen3.7-plus", "qwen3.6-plus", "qwen-plus"],
  },

  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    vlEnv: "DEEPSEEK_VL_MODEL",
    textEnv: "DEEPSEEK_TEXT_MODEL",
    defaultVl: "deepseek-v4-flash-vision-exp",
    defaultText: "deepseek-v4-pro",
    listMode: "openai",
    fallback: [
      {
        id: "deepseek-v4-pro",
        label: "DeepSeek-V4-Pro",
        vision: false,
        recommended: true,
        note: "旗舰，解题更稳",
      },
      {
        id: "deepseek-v4-flash",
        label: "DeepSeek-V4-Flash",
        vision: false,
        recommended: false,
        note: "更快更省",
      },
      {
        id: "deepseek-v4-flash-vision-exp",
        label: "DeepSeek-V4-Flash-Vision",
        vision: true,
        recommended: true,
        note: "实验版，目前唯一能看图的 DeepSeek 模型",
      },
    ],
    preferVl: ["deepseek-v4-flash-vision-exp"],
    preferText: ["deepseek-v4-pro", "deepseek-v4-flash"],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as LlmProviderName[];

export function isProviderId(value: unknown): value is LlmProviderName {
  return typeof value === "string" && value in PROVIDERS;
}

export function specOf(id: LlmProviderName): ProviderSpec {
  return PROVIDERS[id];
}

/** 默认公司 —— .env 里没写或写了个不认识的值时用它 */
export const DEFAULT_PROVIDER: LlmProviderName = "qwen";
