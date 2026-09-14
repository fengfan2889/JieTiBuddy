import type { FastifyInstance, FastifyRequest } from "fastify";

import { checkApiKey } from "../lib/apiKey.js";
import { logger } from "../lib/logger.js";
import { PROVIDER_IDS, isProviderId, specOf } from "../providers/catalog.js";
import { getProvider, resetProvider } from "../providers/index.js";
import { modelCatalog, resetModelCache } from "../providers/models.js";
import {
  activeProvider,
  isConfigured,
  maskedKeyOf,
  setActiveProvider,
  setApiKey,
  setModels,
  textModelOf,
  vlModelOf,
  wasPersisted,
} from "../providers/state.js";
import { LlmError, NoApiKeyError } from "../providers/types.js";
import type {
  ConfigStatus,
  LlmProviderName,
  ProviderInfo,
  SaveConfigRequest,
  VerifyApiKeyResult,
} from "../shared.js";

export function registerConfigRoutes(app: FastifyInstance): void {
  app.get("/api/config", async () => ({ ok: true, data: configStatus() }));

  /**
   * 局部更新：当前公司、密钥、读题模型、解题模型都走这一个口。
   *
   * 一次请求里带了多个字段时，**先把所有字段校验完再逐项应用** ——
   * 否则会出现「公司切过去了、密钥没存下」这种半成品状态，
   * 用户看到的就是「我明明填了它却说没填」。
   */
  app.put<{ Body: SaveConfigRequest }>("/api/config", async (req, reply) => {
    if (!isLocalRequest(req)) return rejectRemote(reply);

    const body = req.body ?? {};
    const target: LlmProviderName = body.provider ?? activeProvider();

    /**
     * 密钥留空 = 「不改动」，沿用已经存下的那一把。
     *
     * 设置页在已经配过密钥时允许留空点保存（例如换了模型，想顺手验一下连通性），
     * 那时前端不会带上 apiKey 字段；这里再兜一层 —— 任何调用方传空串或纯空格
     * 也一律当成「不改」，而不是回一个 EMPTY_KEY 让人以为密钥被弄丢了。
     * 真要换密钥，把新的粘进来覆盖即可。
     */
    const nextKey = (body.apiKey ?? "").trim();

    if (body.provider !== undefined && !isProviderId(body.provider)) {
      return reply.code(400).send(fail("INVALID_PROVIDER", `不认识的模型公司：${body.provider}`));
    }
    if (nextKey) {
      const check = checkApiKey(nextKey);
      if (!check.ok) return reply.code(400).send(fail(check.code, check.message));
    }
    if (body.vlModel !== undefined && !body.vlModel.trim()) {
      return reply.code(400).send(fail("EMPTY_MODEL", "读题模型不能是空的"));
    }
    if (body.textModel !== undefined && !body.textModel.trim()) {
      return reply.code(400).send(fail("EMPTY_MODEL", "解题模型不能是空的"));
    }

    if (body.provider !== undefined) setActiveProvider(body.provider);

    if (nextKey) {
      setApiKey(target, nextKey);
      logger.info("API Key 已更新", {
        provider: target,
        masked: maskedKeyOf(target),
        persisted: wasPersisted(target),
      });
    }

    if (body.vlModel !== undefined || body.textModel !== undefined) {
      setModels(target, { vl: body.vlModel?.trim(), text: body.textModel?.trim() });
      logger.info("模型已切换", {
        provider: target,
        vl: vlModelOf(target),
        text: textModelOf(target),
      });
    }

    // 公司和密钥都会影响「用哪个地址、拿哪把钥匙去请求」，缓存必须跟着丢；
    // 模型列表也要重取 —— 换了公司就是另一家的模型。
    resetProvider();
    if (body.provider !== undefined || nextKey) resetModelCache();

    return { ok: true, data: configStatus() };
  });

  /** 模型下拉的数据源。refresh=1 强制重取（用户在页面上点「重新获取」） */
  app.get<{ Querystring: { provider?: string; refresh?: string } }>(
    "/api/config/models",
    async (req, reply) => {
      const id = req.query.provider ?? activeProvider();
      if (!isProviderId(id)) {
        return reply.code(400).send(fail("INVALID_PROVIDER", `不认识的模型公司：${id}`));
      }

      return { ok: true, data: await modelCatalog(id, { fresh: req.query.refresh === "1" }) };
    },
  );

  /**
   * 连通性自检。用**读题模型** + 一张小图发一次最小请求 ——
   * 验证的是产品真正依赖的那条通路（读图），比只 ping 文本模型有意义得多。
   */
  app.post("/api/config/verify", async (req, reply) => {
    if (!isLocalRequest(req)) return rejectRemote(reply);

    const id = activeProvider();
    const spec = specOf(id);

    if (!isConfigured(id)) {
      return {
        ok: true,
        data: { ok: false, message: `${spec.label} 还没有填密钥。` } satisfies VerifyApiKeyResult,
      };
    }

    const model = vlModelOf(id);
    const started = Date.now();

    try {
      const replyText = await getProvider().chat(
        [{ role: "user", content: "只回复两个字：收到", images: [TINY_IMAGE] }],
        { model, temperature: 0, signal: AbortSignal.timeout(30_000) },
      );

      return {
        ok: true,
        data: {
          ok: true,
          message: `连接正常，${model} 已响应（回话：${replyText.trim().slice(0, 12) || "空"}）`,
          latencyMs: Date.now() - started,
        } satisfies VerifyApiKeyResult,
      };
    } catch (err) {
      return {
        ok: true,
        data: {
          ok: false,
          message: explain(err, model, spec.label),
          latencyMs: Date.now() - started,
        } satisfies VerifyApiKeyResult,
      };
    }
  });
}

function configStatus(): ConfigStatus {
  const id = activeProvider();
  const spec = specOf(id);

  return {
    provider: id,
    configured: isConfigured(id),
    masked: maskedKeyOf(id),
    persisted: wasPersisted(id),
    vlModel: vlModelOf(id),
    textModel: textModelOf(id),
    consoleUrl: spec.consoleUrl,
    providers: PROVIDER_IDS.map(providerInfo),
  };
}

/** 下拉里的每一家公司 —— 带上各自的密钥状态，切过去不用再发一次请求 */
function providerInfo(id: LlmProviderName): ProviderInfo {
  const spec = specOf(id);
  return {
    id,
    label: spec.label,
    consoleUrl: spec.consoleUrl,
    keyPlaceholder: spec.keyPlaceholder,
    configured: isConfigured(id),
    masked: maskedKeyOf(id),
    vlModel: vlModelOf(id),
    textModel: textModelOf(id),
  };
}

function fail(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

/** 把各种失败翻译成「下一步该干什么」，而不是甩一串英文堆栈 */
function explain(err: unknown, model: string, label: string): string {
  if (err instanceof NoApiKeyError) return `${label} 还没有填密钥。`;

  if (err instanceof LlmError) {
    const status = err.status ?? 0;
    if (status === 401) return "密钥不对。多半是复制时多了空格或漏了字符，回控制台重新复制一次。";
    if (status === 402) return `${label} 账户余额不足，去控制台充值后再试。`;
    if (status === 403) return `这把密钥没有调用 ${model} 的权限，去控制台确认已开通这个模型。`;
    if (status === 404) {
      return `这家公司没有 ${model} 这个模型（或你的账号还开不了它）。换个模型试试。`;
    }
    if (status === 429) return "密钥是对的，但额度用完或请求太频繁了，去控制台看一下用量。";
    if (status >= 500) return `模型服务暂时不可用（HTTP ${status}），过几分钟再试。`;
    return `调用被拒绝（HTTP ${status}）。详细信息：${err.body?.slice(0, 120) ?? err.message}`;
  }

  if (err instanceof Error && err.name === "TimeoutError") {
    return "等了 30 秒没有响应，检查这台电脑的网络能不能访问模型服务。";
  }

  return `连不上模型服务：${(err as Error).message}。检查网络后重试。`;
}

/**
 * 写配置的接口只对环回 / 私网地址开放。
 *
 * 边界在哪：能进到这台机器的局域网（家里 Wi-Fi）就能改密钥。这对家用场景是
 * 合理的 —— 手机要能通过局域网填 Key。但**别把 8787 端口直接映射到公网**，
 * 那等于把「改密钥」的开关挂到互联网上。真要公网部署，请在前面加一层
 * 带鉴权的反向代理，并把这里改成校验登录态。
 */
function isLocalRequest(req: FastifyRequest): boolean {
  const ip = req.ip.replace(/^::ffff:/, "");
  const allowed = isPrivateAddress(ip);
  if (!allowed) logger.warn("拒绝了来自非私网地址的配置写入请求", { ip });
  return allowed;
}

function isPrivateAddress(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;

  const cgnat = ip.match(/^172\.(\d{1,3})\./);
  if (cgnat) {
    const second = Number(cgnat[1]);
    if (second >= 16 && second <= 31) return true;
  }

  // IPv6：唯一本地地址 fc00::/7、链路本地 fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

  return false;
}

function rejectRemote(reply: {
  code: (n: number) => { send: (body: unknown) => unknown };
}) {
  return reply.code(403).send(
    fail("REMOTE_NOT_ALLOWED", "出于安全考虑，只有本机或同一局域网内的设备可以修改配置。"),
  );
}

/**
 * 64×64 的 PNG —— 只为了让 VL 模型走一次完整的图片通路。
 *
 * ⚠️ 别改回 1×1：DashScope 会回
 * `InvalidParameter: The image length and width do not meet the model restriction`，
 * 结果就是任何一把正常密钥点「测试连接」都显示失败 —— 把人引向错误的方向。
 */
const TINY_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAmklEQVR42u3XwQmAMBBE0e2/QuvYCkQISEJyd/Dl7OHPyX3Vh3cd3te+r+j67q7o+s2ArPp1QFz9NCCx/h0QWj8G5NY/A6LrjwOC/m4VXb8ZEHdZVHT9NCD0qqvo+jEg+qIuHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHuABHviNB27lxvJ3o7IOVAAAAABJRU5ErkJggg==";
