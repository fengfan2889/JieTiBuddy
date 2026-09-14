import { ENV_FILE, config } from "../config.js";
import { looksLikePlaceholder, maskApiKey } from "../lib/apiKey.js";
import { upsertEnvValue } from "../lib/envFile.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_PROVIDER, isProviderId, specOf } from "./catalog.js";
import type { LlmProviderName } from "../shared.js";

/**
 * 运行时配置状态层：**每家公司各有一把密钥、各有一套读题/解题模型**。
 *
 * 两层来源，页面上填的优先：
 *   1. 内存覆盖（设置页当场生效，不用重启、也不用去改文件）
 *   2. .env（重启后由 dotenv 读回来）
 * 写入时两份都更新，所以两条路最终一致。
 *
 * 为什么不是「一个全局 Key + 一个全局模型」：换个模型公司就要换一把密钥，
 * 全局单值会导致「切过去还得重新粘一遍、切回来发现原来的没了」。
 */

const runtimeKey = new Map<LlmProviderName, string>();
const runtimeModel = new Map<LlmProviderName, { vl?: string; text?: string }>();

/** 是否成功写进 .env。写不进去也能用（内存里生效），但要让用户知道重启会丢 */
const persisted = new Map<LlmProviderName, boolean>();

let runtimeProvider: LlmProviderName | null = null;

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function activeProvider(): LlmProviderName {
  if (runtimeProvider) return runtimeProvider;
  return isProviderId(config.LLM_PROVIDER) ? config.LLM_PROVIDER : DEFAULT_PROVIDER;
}

/** 切换当前使用的公司。返回是否成功落盘 */
export function setActiveProvider(id: LlmProviderName): boolean {
  if (id === activeProvider()) return true;

  runtimeProvider = id;
  const ok = upsertEnvValue(ENV_FILE, "LLM_PROVIDER", id);
  if (!ok) logger.warn("LLM_PROVIDER 未能写入 .env，仅本次运行内有效", { file: ENV_FILE });
  return ok;
}

export function apiKeyOf(id: LlmProviderName): string {
  const runtime = runtimeKey.get(id);
  if (runtime !== undefined) return runtime;
  return readEnv(specOf(id).keyEnv);
}

/** 占位符（sk-xxxxxxxx）也算没配 —— 拿它去调只会换来一个 401 */
export function isConfigured(id: LlmProviderName): boolean {
  const key = apiKeyOf(id);
  return key.length > 0 && !looksLikePlaceholder(key);
}

export function setApiKey(id: LlmProviderName, key: string): boolean {
  const trimmed = key.trim();
  runtimeKey.set(id, trimmed);

  const ok = upsertEnvValue(ENV_FILE, specOf(id).keyEnv, trimmed);
  persisted.set(id, ok);
  if (!ok) logger.warn("API Key 未能写入 .env，仅本次运行内有效", { file: ENV_FILE, provider: id });
  return ok;
}

/** 从 .env 读来的密钥本来就是落盘的，所以默认 true */
export function wasPersisted(id: LlmProviderName): boolean {
  return persisted.get(id) ?? true;
}

function modelOf(id: LlmProviderName, role: "vl" | "text"): string {
  const runtime = runtimeModel.get(id)?.[role];
  if (runtime) return runtime;

  const spec = specOf(id);
  const fromEnv = readEnv(role === "vl" ? spec.vlEnv : spec.textEnv);
  return fromEnv || (role === "vl" ? spec.defaultVl : spec.defaultText);
}

export function vlModelOf(id: LlmProviderName): string {
  return modelOf(id, "vl");
}

export function textModelOf(id: LlmProviderName): string {
  return modelOf(id, "text");
}

export function setModels(id: LlmProviderName, patch: { vl?: string; text?: string }): boolean {
  const spec = specOf(id);
  const current = runtimeModel.get(id) ?? {};
  let ok = true;

  if (patch.vl) {
    current.vl = patch.vl;
    ok = upsertEnvValue(ENV_FILE, spec.vlEnv, patch.vl) && ok;
  }
  if (patch.text) {
    current.text = patch.text;
    ok = upsertEnvValue(ENV_FILE, spec.textEnv, patch.text) && ok;
  }

  runtimeModel.set(id, current);
  if (!ok) logger.warn("模型名未能写入 .env，仅本次运行内有效", { file: ENV_FILE, provider: id });
  return ok;
}

// ---- 当前生效的那一套（引擎与路由只关心「现在用什么」）----

export function vlModel(): string {
  return vlModelOf(activeProvider());
}

export function textModel(): string {
  return textModelOf(activeProvider());
}

export function maskedKeyOf(id: LlmProviderName): string {
  return isConfigured(id) ? maskApiKey(apiKeyOf(id)) : "";
}

/**
 * 启动自检：没有 Key 只警告，不 process.exit。
 *
 * 这是「设置页填 Key」能成立的前提 —— 旧实现没 Key 就退出进程，
 * 结果连填 Key 的页面都进不去，死锁。
 * 真正的拦截下沉到 getProvider()：调用模型时抛 NoApiKeyError，
 * 前端据此把人引到设置页。
 */
export function warnIfNoApiKey(): void {
  const id = activeProvider();
  if (isConfigured(id)) return;
  console.warn(
    `[config] LLM_PROVIDER=${id} 但还没有 API Key。\n` +
      `         打开 App 首页 →「接入 AI 模型」填写，或写入 ${ENV_FILE}`,
  );
}
