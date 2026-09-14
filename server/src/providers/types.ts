/**
 * LLM Provider 抽象层。
 * 业务代码只依赖这个接口 —— 换供应商只改 config，不碰引擎。
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** 图片：data URL 或 http(s) URL。仅 user 消息支持。 */
  images?: string[];
}

export interface ChatOptions {
  /** 覆盖默认模型（多模态用 VL 模型，纯文本用轻量模型） */
  model?: string;
  temperature?: number;
  /** 要求模型返回严格 JSON */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: string;
  /** 默认模型 */
  readonly model: string;
  /** 一次性返回 */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  /** 流式返回增量文本 */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * 一把 Key 都没有。这不是「服务器坏了」，而是「还差一步配置」——
 * 单独成类，好让路由层回 503 NO_API_KEY，前端据此把人引到设置页，
 * 而不是甩一个 500 让人不知所措。
 */
export class NoApiKeyError extends Error {
  constructor() {
    super("还没有配置 AI 模型的密钥，去设置页填一下");
    this.name = "NoApiKeyError";
  }
}

/** 把 ChatMessage 转成 OpenAI 兼容的 message 结构 */
export function toOpenAiMessage(m: ChatMessage): Record<string, unknown> {
  if (!m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  return {
    role: m.role,
    content: [
      { type: "text", text: m.content },
      ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
    ],
  };
}
