import { LlmError, toOpenAiMessage } from "./types.js";
import type { ChatMessage, ChatOptions, LlmProvider } from "./types.js";

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

/**
 * OpenAI 兼容协议的通用实现。
 *
 * 通义千问（DashScope 兼容模式）与 OpenAI 共用同一套 /chat/completions 协议，
 * 因此不再为每家写一份 provider —— 差异全在 baseUrl / model / apiKey 三个配置项上。
 */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): LlmProvider {
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  function buildBody(messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
    return {
      model: opts.model ?? options.defaultModel,
      messages: messages.map(toOpenAiMessage),
      stream,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    };
  }

  async function request(
    messages: ChatMessage[],
    opts: ChatOptions,
    stream: boolean,
  ): Promise<Response> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(buildBody(messages, opts, stream)),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LlmError(`${options.name} 调用失败: HTTP ${res.status}`, res.status, body);
    }
    return res;
  }

  return {
    name: options.name,
    model: options.defaultModel,

    async chat(messages, opts = {}) {
      const res = await request(messages, opts, false);
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new LlmError(`${options.name} 返回内容为空`);
      return text;
    },

    async *chatStream(messages, opts = {}) {
      const res = await request(messages, opts, true);
      if (!res.body) throw new LlmError(`${options.name} 未返回流式响应体`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE 以空行分隔事件；这里按行处理，保留最后一段不完整的行
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") return;

            const delta = extractDelta(payload);
            if (delta) yield delta;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

function extractDelta(payload: string): string | null {
  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    return json.choices?.[0]?.delta?.content ?? null;
  } catch {
    // 单行解析失败不该中断整条流
    return null;
  }
}
