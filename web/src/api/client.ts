import type { ApiResponse, DoneEvent, MetaEvent } from "@jtb/shared";

/** 构建期默认值（vite 的 VITE_API_BASE）。留空 = 同源，开发时由 vite 代理到 8787。 */
const ENV_BASE = normalize(import.meta.env.VITE_API_BASE ?? "");
const LS_KEY = "jtb.apiBase";

let runtimeBase: string | null = null;

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * 运行时覆盖的服务地址，存在浏览器本地。
 *
 * 为什么需要：装成手机 App 以后，「同源」就不成立了 —— 手机得知道电脑在哪，
 * 只能填一个局域网地址（http://192.168.x.x:8787）。这个值编译期定不下来，
 * 所以放在设置页里让用户填。
 */
export function getApiBaseOverride(): string {
  if (runtimeBase === null) {
    try {
      runtimeBase = normalize(localStorage.getItem(LS_KEY) ?? "");
    } catch {
      runtimeBase = ""; // 隐私模式下 localStorage 不可用
    }
  }
  return runtimeBase;
}

export function setApiBaseOverride(value: string): void {
  const next = normalize(value);
  runtimeBase = next;
  try {
    if (next) localStorage.setItem(LS_KEY, next);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* 存不了就算了，本次运行内仍然生效 */
  }
}

/** 实际生效的请求前缀（空字符串代表同源） */
export function effectiveBase(): string {
  return getApiBaseOverride() || ENV_BASE;
}

/** 构建期默认前缀，设置页用来提示「默认值是什么」 */
export function defaultBase(): string {
  return ENV_BASE;
}

/** 补全成完整地址，用于展示 */
export function resolveApiUrl(path: string): string {
  const base = effectiveBase();
  return base ? `${base}${path}` : `${window.location.origin}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 后端说「没配密钥」时，正确反应是带人去设置页，而不是原地弹个红字 ——
 * 用户看到「还没有配置 API Key」也不知道该点哪里。
 */
export function isNoApiKeyError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "NO_API_KEY";
}

/**
 * fetch 在「连不上」时抛的是 `TypeError: Failed to fetch` —— 家长看不懂，
 * 也不知道该改哪里。这里换成一句能指明去哪儿检查的中文。
 */
async function fetchOrExplain(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const where = effectiveBase() || window.location.origin;
    throw new ApiError(
      `连不上服务（${where}）。检查一下设置里的「服务地址」填得对不对，` +
        `以及跑服务的那个窗口是不是还开着。`,
      "NETWORK",
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchOrExplain(`${effectiveBase()}${path}`, init);
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json?.ok) {
    throw new ApiError(
      json?.error?.message ?? `请求失败（HTTP ${res.status}）`,
      json?.error?.code ?? "HTTP_ERROR",
    );
  }
  return json.data as T;
}

/**
 * 没有 body 时**不要**带 content-type。
 *
 * 否则 Fastify 会直接拒收：`Body cannot be empty when content-type is set to 'application/json'`。
 * `POST /api/config/verify` 就是这种「不需要入参」的接口 —— 之前每次保存密钥后
 * 自动测试连接都必然报错，学生/家长看到的是「测试失败」，其实密钥存得好好的。
 */
function jsonInit(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method };
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, jsonInit("POST", body)),
  patch: <T>(path: string, body?: unknown) => request<T>(path, jsonInit("PATCH", body)),
  put: <T>(path: string, body?: unknown) => request<T>(path, jsonInit("PUT", body)),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, blob: Blob, filename = "problem.jpg") => {
    const form = new FormData();
    form.append("file", blob, filename);
    return request<T>(path, { method: "POST", body: form });
  },
};

// ---------- SSE ----------

export interface SseHandlers {
  onMeta?: (meta: MetaEvent) => void;
  onDelta?: (text: string) => void;
  onDone?: (done: DoneEvent) => void;
}

/**
 * SSE 走 POST，所以不能用 EventSource，只能手撸一个流解析。
 * 服务端按 `event: x\ndata: y\n\n` 分帧，这里按空行切事件。
 */
export async function postSse(
  path: string,
  body: unknown,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetchOrExplain(`${effectiveBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body ?? {}),
    signal,
  });

  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new ApiError(
      json?.error?.message ?? `请求失败（HTTP ${res.status}）`,
      json?.error?.code ?? "HTTP_ERROR",
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        dispatch(frame, handlers);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function dispatch(frame: string, handlers: SseHandlers): void {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }

  if (event === "meta") handlers.onMeta?.(payload as MetaEvent);
  else if (event === "delta") handlers.onDelta?.((payload as { text: string }).text ?? "");
  else if (event === "done") handlers.onDone?.(payload as DoneEvent);
}
