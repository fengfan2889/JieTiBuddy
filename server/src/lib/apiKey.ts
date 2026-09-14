/**
 * 密钥的体检与脱敏。与具体供应商无关，配置路由与状态层共用一份。
 */

/** 短于这个长度基本是复制时漏了 */
export const MIN_API_KEY_LENGTH = 12;

/**
 * 占位符识别。
 *
 * `.env` 里留着 `sk-xxxxxxxx` 这种示例值，是一个「非空但没用」的假配置 ——
 * 不挡掉的话首页会显示「已接入」，直到真的拍照才炸 401。
 */
export function looksLikePlaceholder(key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  if (/(.)\1{5,}/.test(k)) return true; // sk-xxxxxxxx、11111111
  if (/your[-_ ]?api[-_ ]?key/i.test(k)) return true;
  if (/changeme|placeholder|xxxxxxxx/i.test(k)) return true;
  if (/^<.+>$/.test(k)) return true;
  return false;
}

/** sk-abcd1234...wxyz —— 够辨认是哪一把，又不足以被拿去用 */
export function maskApiKey(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 8) return `${k.slice(0, 2)}${"*".repeat(Math.max(0, k.length - 2))}`;
  return `${k.slice(0, 6)}${"*".repeat(6)}${k.slice(-4)}`;
}

export type KeyCheck =
  | { ok: true; key: string }
  | { ok: false; code: string; message: string };

/**
 * 保存前的体检。报错文案是直接给用户看的，必须说清「下一步干什么」，
 * 而不是回一句「格式错误」让他自己猜。
 */
export function checkApiKey(raw: string): KeyCheck {
  const key = (raw ?? "").trim();
  if (!key) {
    return { ok: false, code: "EMPTY_KEY", message: "密钥是空的，先粘贴进去再保存" };
  }
  if (/\s/.test(key)) {
    return {
      ok: false,
      code: "KEY_HAS_SPACE",
      message: "密钥里混进了空格或换行，多半是复制时多选了。请重新复制一次。",
    };
  }
  if (key.length < MIN_API_KEY_LENGTH) {
    return {
      ok: false,
      code: "KEY_TOO_SHORT",
      message: `密钥看起来不完整（只有 ${key.length} 位），确认是不是复制漏了。`,
    };
  }
  return { ok: true, key };
}
