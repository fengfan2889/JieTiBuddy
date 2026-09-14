import { logger } from "../lib/logger.js";
import { apiKeyOf, isConfigured } from "./state.js";
import { specOf } from "./catalog.js";
import type { ProviderSpec } from "./catalog.js";
import type { LlmProviderName, ModelCatalog, ModelOption } from "../shared.js";

/**
 * 模型列表：向各家公司要「你现在能用哪些模型」。
 *
 * 为什么非得调接口而不是写死一份：模型的增删比这个 App 的发版快得多 ——
 * 写死的列表半年就馊了，用户会以为「新模型不支持」。写死的部分只当兜底。
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 8;

/** 百炼原生接口 —— 只有它带能力标记（VU = 视觉理解），兼容模式那份只有 id */
const DASHSCOPE_NATIVE = "https://dashscope.aliyuncs.com/api/v1";

/** 能拿来对话的能力标记；其余是 embedding / rerank / 语音 / 图像生成，不进下拉 */
const CHAT_CAPS = new Set(["TG", "VU", "Reasoning"]);

/** 带日期的快照版（qwen-plus-2025-07-28）不进列表 —— 否则一个型号刷出十几条 */
const DATED_SNAPSHOT = /-\d{4}(-\d{2}-\d{2})?$/;

/** 明确不是解题用的型号 */
const NON_CHAT_HINT = /character|intent-detect|coder/i;

/** 名字里看得出能看图 */
const VISION_HINT = /vision|(^|[-_])vl([-_]|$)/i;

/** 显然不是对话模型 */
const NON_CHAT_OPENAI = /embedding|rerank|whisper|tts|moderation|dall-e/i;

const cache = new Map<LlmProviderName, { at: number; data: ModelCatalog }>();

export async function modelCatalog(
  provider: LlmProviderName,
  opts: { fresh?: boolean } = {},
): Promise<ModelCatalog> {
  const hit = cache.get(provider);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const spec = specOf(provider);

  // 没有密钥就问不到列表。这不是错误，是要告诉用户「填完密钥会变长」——
  // 否则他会以为这家公司只有这几款模型。
  if (!isConfigured(provider)) {
    return shape(provider, "fallback", spec.fallback, {
      message: `还没填 ${spec.label} 的密钥，先列出常见模型。填好密钥后这里会自动换成接口里的完整列表。`,
    });
  }

  try {
    const items =
      spec.listMode === "dashscope"
        ? await listFromDashScope(apiKeyOf(provider))
        : await listOpenAiCompatible(spec, apiKeyOf(provider));

    if (items.length === 0) throw new Error("接口返回的列表是空的");

    const data = shape(provider, "remote", items);
    cache.set(provider, { at: Date.now(), data });
    return data;
  } catch (err) {
    logger.warn("模型列表拉取失败，回退到内置候选", {
      provider,
      message: (err as Error).message,
    });
    return shape(provider, "fallback", spec.fallback, {
      message: `没能取到 ${spec.label} 的模型列表（${(err as Error).message}），先列出常见模型。`,
    });
  }
}

/** 丢掉缓存 —— 换密钥、换公司后必须重新取，否则列表还是上一把密钥看到的 */
export function resetModelCache(): void {
  cache.clear();
}

/** 把原始列表切成「读题可用」与「解题可用」两组，并标出推荐项 */
function shape(
  provider: LlmProviderName,
  source: ModelCatalog["source"],
  items: ModelOption[],
  extra: { message?: string } = {},
): ModelCatalog {
  const spec = specOf(provider);

  const bestText = spec.preferText.find((id) => items.some((i) => i.id === id)) ?? null;
  const bestVl =
    spec.preferVl.find((id) => items.some((i) => i.id === id && i.vision)) ?? null;

  const tag = (item: ModelOption, best: string | null): ModelOption => ({
    ...item,
    recommended: item.id === best,
  });
  const byRecommended = (a: ModelOption, b: ModelOption) =>
    Number(b.recommended) - Number(a.recommended);

  return {
    provider,
    source,
    message: extra.message,
    vl: items.filter((i) => i.vision).map((i) => tag(i, bestVl)).sort(byRecommended),
    text: items.map((i) => tag(i, bestText)).sort(byRecommended),
  };
}

// ---------- 通义千问（百炼原生接口，带能力标记）----------

interface DashModel {
  model?: string;
  name?: string;
  capabilities?: string[];
  provider?: string;
  prices?: Array<{ prices?: Array<{ type?: string; price?: string }> }>;
}

async function listFromDashScope(key: string): Promise<ModelOption[]> {
  const first = await dashPage(key, 1);
  const pageCount = Math.min(Math.ceil(first.total / PAGE_SIZE), MAX_PAGES);

  const rest =
    pageCount > 1
      ? await Promise.all(range(2, pageCount).map((page) => dashPage(key, page)))
      : [];

  return first.models
    .concat(...rest.map((p) => p.models))
    .reduce<ModelOption[]>((acc, m) => pushDashModel(acc, m), []);
}

async function dashPage(
  key: string,
  pageNo: number,
): Promise<{ total: number; models: DashModel[] }> {
  const url = `${DASHSCOPE_NATIVE}/models?page_no=${pageNo}&page_size=${PAGE_SIZE}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as { output?: { total?: number; models?: DashModel[] } };
  return { total: json.output?.total ?? 0, models: json.output?.models ?? [] };
}

function pushDashModel(acc: ModelOption[], m: DashModel): ModelOption[] {
  const id = m.model;
  if (!id) return acc;
  if (m.provider !== "qwen") return acc; // 百炼上还挂着别家的模型，不属于这家公司
  if (acc.some((x) => x.id === id)) return acc;

  const caps = m.capabilities ?? [];
  if (!caps.some((c) => CHAT_CAPS.has(c))) return acc;
  if (DATED_SNAPSHOT.test(id) || NON_CHAT_HINT.test(id)) return acc;

  acc.push({
    id,
    label: m.name?.trim() || id,
    vision: caps.includes("VU"),
    recommended: false,
    note: priceNote(m),
  });
  return acc;
}

/** 「¥12 / ¥36 每百万 tokens」—— 选模型时的实际决策依据 */
function priceNote(m: DashModel): string | undefined {
  const list = m.prices?.[0]?.prices ?? [];
  const pick = (type: string) => Number(list.find((p) => p.type === type)?.price);

  const input = pick("input_token");
  const output = pick("output_token");
  if (!Number.isFinite(input) || !Number.isFinite(output)) return undefined;

  return `¥${input} / ¥${output} 每百万 tokens`;
}

// ---------- OpenAI 兼容接口（DeepSeek 等）----------

async function listOpenAiCompatible(spec: ProviderSpec, key: string): Promise<ModelOption[]> {
  const res = await fetch(`${spec.baseUrl}/models`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (json.data ?? [])
    .map((d) => d.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0 && !NON_CHAT_OPENAI.test(id));

  // 这家接口只给 id，不给「能不能看图」—— 只能按命名习惯猜，
  // 猜不准的代价只是列表里多/少一项，选错了会在测试连接时立刻暴露。
  return ids.map((id) => ({
    id,
    label: id,
    vision: VISION_HINT.test(id),
    recommended: false,
  }));
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
