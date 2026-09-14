import { createOpenAiCompatibleProvider } from "./openaiCompatible.js";
import { activeProvider, apiKeyOf, isConfigured } from "./state.js";
import { specOf } from "./catalog.js";
import { NoApiKeyError } from "./types.js";
import type { LlmProvider } from "./types.js";
import type { LlmProviderName } from "../shared.js";

/**
 * Provider 工厂。业务代码只依赖 LlmProvider 接口 ——
 * 换公司只改设置页里的下拉，引擎一行都不动。
 *
 * 通义千问（DashScope 兼容模式）与 DeepSeek 共用同一套 /chat/completions 协议，
 * 所以两家共用一份实现，差异全在 catalog 里的 baseUrl / key / model 三个值上。
 */

/** 同一时刻只有一家公司在用，缓存一条就够 */
let cached: { provider: LlmProviderName; key: string; impl: LlmProvider } | null = null;

/**
 * apiKey 是闭包进 provider 实例的，改状态影响不到已经建好的实例，
 * 所以按（公司 + Key）判断缓存是否可用 —— 在设置页改完立刻生效，不用重启。
 */
export function getProvider(): LlmProvider {
  const id = activeProvider();

  // 占位符（sk-xxxxxxxx）也算没配 —— 拿它去调只会换来一个 401
  if (!isConfigured(id)) throw new NoApiKeyError();

  const key = apiKeyOf(id);
  if (cached && cached.provider === id && cached.key === key) return cached.impl;

  const spec = specOf(id);
  const impl = createOpenAiCompatibleProvider({
    name: id,
    baseUrl: spec.baseUrl,
    apiKey: key,
    defaultModel: spec.defaultVl,
  });

  cached = { provider: id, key, impl };
  return impl;
}

/** 显式丢弃缓存（换公司、换 Key 后调用） */
export function resetProvider(): void {
  cached = null;
}

export { vlModel, textModel, vlModelOf, textModelOf, activeProvider } from "./state.js";
export * from "./types.js";
