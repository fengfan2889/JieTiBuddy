import { randomUUID } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function now(): number {
  return Date.now();
}

/** 安全 JSON 解析：解析失败给兜底值，绝不抛异常污染主流程 */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 从模型回复里抠出 JSON 对象。
 * 模型经常在 JSON 外包一层 ```json 代码块或加解释文字，这里做容错。
 */
export function extractJson<T>(raw: string): T | null {
  const text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();

  const direct = tryParse<T>(candidate);
  if (direct !== null) return direct;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return tryParse<T>(candidate.slice(start, end + 1));
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
