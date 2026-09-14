import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * 就地更新 .env 里某个键的值：命中则替换那一行，没命中则追加。
 *
 * 刻意不做成「重写整个文件」——用户的 .env 里还有端口、模型名、
 * 各种注释，覆盖式写入会把这些全丢掉。
 *
 * 返回值表示是否成功落盘：写失败（只读挂载、权限不足）不该让
 * 本次填的 Key 失效，所以调用方只记日志、不中断。
 */
export function upsertEnvValue(file: string, key: string, value: string): boolean {
  try {
    const original = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = original.length > 0 ? original.split(/\r?\n/) : [];

    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    let replaced = false;

    const next = lines.map((line) => {
      if (!replaced && pattern.test(line)) {
        replaced = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!replaced) {
      // 文件末尾没有空行时补一个，避免和上一条挤在一起
      const last = next.at(-1);
      if (last !== undefined && last.trim() !== "") next.push("");
      next.push(`${key}=${value}`);
    }

    writeFileSync(file, next.join("\n"), "utf8");
    return true;
  } catch {
    return false;
  }
}
