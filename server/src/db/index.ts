import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";

mkdirSync(dirname(config.DATABASE_URL), { recursive: true });

/**
 * 用 Node 内置的 `node:sqlite`，不用 better-sqlite3。
 *
 * 原因：better-sqlite3 是原生模块，按 Node 的 ABI(NODE_MODULE_VERSION) 编译。
 * 装依赖时用的 Node 和跑服务时的 Node 一旦不是同一个大版本，就会
 * `ERR_DLOPEN_FAILED: compiled against a different Node.js version`。
 * 本机同时存在 Node 22 与 24，这个坑必踩。内置模块没有 ABI 问题。
 *
 * 要求 Node >= 22.13（该版本起 `node:sqlite` 不再需要 --experimental-sqlite）。
 */
if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error(`需要 Node.js 22.13 或更高版本，当前 ${process.versions.node}`);
}

export const sqlite = new DatabaseSync(config.DATABASE_URL);

sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

/** MVP 用「建表即迁移」，不引入迁移工具。表结构变更时删掉 .sqlite 文件重建即可。 */
sqlite.exec(`
CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  image_path TEXT,
  local_image_path TEXT,
  ocr_text TEXT NOT NULL DEFAULT '',
  ocr_latex TEXT NOT NULL DEFAULT '[]',
  ocr_confirmed INTEGER NOT NULL DEFAULT 0,
  ocr_confidence REAL NOT NULL DEFAULT 0,
  subject TEXT NOT NULL DEFAULT 'other',
  grade_hint TEXT NOT NULL DEFAULT '',
  difficulty INTEGER NOT NULL DEFAULT 3,
  knowledge_points TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  support_level INTEGER NOT NULL DEFAULT 0,
  student_state TEXT,
  step_index INTEGER NOT NULL DEFAULT 1,
  plan TEXT,
  internal_answer TEXT,
  current_route TEXT NOT NULL DEFAULT 'main',
  stuck_streak INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  state TEXT,
  support_level INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_problem ON sessions (problem_id);
`);

logger.info(`sqlite ready: ${config.DATABASE_URL}`);
