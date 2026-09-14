import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

/**
 * .env 的位置按模块自身推，不按 process.cwd()：
 * 从 src/ 还是 dist/ 加载，往上一级都是 server/，跑脚本的目录变了也不会读错文件。
 */
const here = dirname(fileURLToPath(import.meta.url));
const explicitEnv = resolve(here, "..", ".env");

/** 写 Key / 模型名 / 公司时固定写这里 —— 只有一个事实来源，避免回写到别的 .env */
export const ENV_FILE = explicitEnv;

const fallbackEnv = resolve(process.cwd(), ".env");
loadEnv({ path: existsSync(explicitEnv) ? explicitEnv : fallbackEnv });

/**
 * 只放「改了必须重启」的项。
 *
 * 供应商相关的都不在这里 —— 当前公司、密钥、读题/解题模型都要能在设置页当场改
 * （见 providers/state.ts）。放进这张启动时解析一次的快照里，就等于要求用户
 * 「改完配置重启服务」，而这个 App 的用户不该被这么要求。
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("./data/jietibuddy.sqlite"),

  /** 只做记录：真正的取值由 providers/state.ts 解释，认不出来就回落默认公司 */
  LLM_PROVIDER: z.string().default("qwen"),

  DEBUG_PROMPT: z.coerce.number().int().default(0),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("[config] 环境变量校验失败：");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isDebugPrompt = config.DEBUG_PROMPT === 1;

export type AppConfig = typeof config;
