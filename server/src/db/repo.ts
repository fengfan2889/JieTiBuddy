import type {
  GuideMap,
  Message,
  MessageContentType,
  MessageRole,
  Problem,
  Session,
  SessionMode,
  SessionStatus,
  StudentState,
  Subject,
  SupportLevel,
} from "../shared.js";

import { id, now, parseJson } from "../lib/util.js";
import { sqlite } from "./index.js";

/** SQLite 里存 0/1 / snake_case，出参统一转成 camelCase 与真实类型 */
interface ProblemRow {
  id: string;
  user_id: string;
  image_path: string | null;
  local_image_path: string | null;
  ocr_text: string;
  ocr_latex: string;
  ocr_confirmed: number;
  ocr_confidence: number;
  subject: string;
  grade_hint: string;
  difficulty: number;
  knowledge_points: string;
  created_at: number;
}

interface SessionRow {
  id: string;
  problem_id: string;
  mode: string;
  status: string;
  support_level: number;
  student_state: string | null;
  step_index: number;
  plan: string | null;
  internal_answer: string | null;
  current_route: string;
  stuck_streak: number;
  turn_count: number;
  created_at: number;
  finished_at: number | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content_type: string;
  content: string;
  state: string | null;
  support_level: number | null;
  created_at: number;
}

type SqlArg = string | number | null;

const one = <T>(sql: string, ...args: SqlArg[]): T | undefined =>
  sqlite.prepare(sql).get(...args) as unknown as T | undefined;

const many = <T>(sql: string, ...args: SqlArg[]): T[] =>
  sqlite.prepare(sql).all(...args) as unknown as T[];

// ---------- problems ----------

export interface CreateProblemInput {
  userId?: string;
  imagePath: string | null;
  ocrText: string;
  ocrLatex: string[];
  ocrConfidence: number;
  subject: Subject;
  gradeHint: string;
  difficulty: number;
  knowledgePoints: string[];
}

function toProblem(row: ProblemRow): Problem {
  return {
    id: row.id,
    imagePath: row.image_path,
    ocrText: row.ocr_text,
    ocrLatex: parseJson<string[]>(row.ocr_latex, []),
    ocrConfirmed: row.ocr_confirmed === 1,
    ocrConfidence: row.ocr_confidence,
    subject: row.subject as Subject,
    gradeHint: row.grade_hint,
    difficulty: row.difficulty,
    knowledgePoints: parseJson<string[]>(row.knowledge_points, []),
    createdAt: row.created_at,
  };
}

export function createProblem(input: CreateProblemInput): Problem {
  const row: ProblemRow = {
    id: id("p"),
    user_id: input.userId ?? "local",
    image_path: input.imagePath,
    local_image_path: null,
    ocr_text: input.ocrText,
    ocr_latex: JSON.stringify(input.ocrLatex),
    ocr_confirmed: 0,
    ocr_confidence: input.ocrConfidence,
    subject: input.subject,
    grade_hint: input.gradeHint,
    difficulty: input.difficulty,
    knowledge_points: JSON.stringify(input.knowledgePoints),
    created_at: now(),
  };

  sqlite
    .prepare(
      `INSERT INTO problems
       (id, user_id, image_path, local_image_path, ocr_text, ocr_latex,
        ocr_confirmed, ocr_confidence, subject, grade_hint, difficulty, knowledge_points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.user_id,
      row.image_path,
      row.local_image_path,
      row.ocr_text,
      row.ocr_latex,
      row.ocr_confirmed,
      row.ocr_confidence,
      row.subject,
      row.grade_hint,
      row.difficulty,
      row.knowledge_points,
      row.created_at,
    );

  return toProblem(row);
}

export function getProblem(problemId: string): Problem | null {
  const row = one<ProblemRow>("SELECT * FROM problems WHERE id = ?", problemId);
  return row ? toProblem(row) : null;
}

export interface UpdateProblemInput {
  ocrText?: string;
  ocrLatex?: string[];
  ocrConfirmed?: boolean;
  subject?: Subject;
  difficulty?: number;
  knowledgePoints?: string[];
}

export function updateProblem(problemId: string, patch: UpdateProblemInput): Problem | null {
  const sets: string[] = [];
  const args: SqlArg[] = [];

  if (patch.ocrText !== undefined) {
    sets.push("ocr_text = ?");
    args.push(patch.ocrText);
  }
  if (patch.ocrLatex !== undefined) {
    sets.push("ocr_latex = ?");
    args.push(JSON.stringify(patch.ocrLatex));
  }
  if (patch.ocrConfirmed !== undefined) {
    sets.push("ocr_confirmed = ?");
    args.push(patch.ocrConfirmed ? 1 : 0);
  }
  if (patch.subject !== undefined) {
    sets.push("subject = ?");
    args.push(patch.subject);
  }
  if (patch.difficulty !== undefined) {
    sets.push("difficulty = ?");
    args.push(patch.difficulty);
  }
  if (patch.knowledgePoints !== undefined) {
    sets.push("knowledge_points = ?");
    args.push(JSON.stringify(patch.knowledgePoints));
  }

  if (sets.length === 0) return getProblem(problemId);

  sqlite
    .prepare(`UPDATE problems SET ${sets.join(", ")} WHERE id = ?`)
    .run(...args, problemId);
  return getProblem(problemId);
}

// ---------- sessions ----------

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    problemId: row.problem_id,
    mode: row.mode as SessionMode,
    status: row.status as SessionStatus,
    supportLevel: row.support_level as SupportLevel,
    studentState: row.student_state as StudentState | null,
    stepIndex: row.step_index,
    currentRoute: row.current_route,
    guideMap: parseJson<GuideMap | null>(row.plan, null) ?? undefined,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** 内部状态：含 internalAnswer，只允许引擎读取，绝不返回给客户端（R12） */
export interface SessionInternal {
  id: string;
  problemId: string;
  mode: SessionMode;
  status: SessionStatus;
  supportLevel: SupportLevel;
  studentState: StudentState | null;
  stepIndex: number;
  guideMap: GuideMap | null;
  internalAnswer: string | null;
  currentRoute: string;
  stuckStreak: number;
  turnCount: number;
  createdAt: number;
  finishedAt: number | null;
}

export interface CreateSessionInput {
  problemId: string;
  mode: SessionMode;
  guideMap: GuideMap | null;
  internalAnswer: string | null;
}

export function createSession(input: CreateSessionInput): Session {
  const row: SessionRow = {
    id: id("s"),
    problem_id: input.problemId,
    mode: input.mode,
    status: "active",
    support_level: 0,
    student_state: null,
    step_index: 1,
    plan: input.guideMap ? JSON.stringify(input.guideMap) : null,
    internal_answer: input.internalAnswer,
    current_route: "main",
    stuck_streak: 0,
    turn_count: 0,
    created_at: now(),
    finished_at: null,
  };

  sqlite
    .prepare(
      `INSERT INTO sessions
       (id, problem_id, mode, status, support_level, student_state, step_index, plan,
        internal_answer, current_route, stuck_streak, turn_count, created_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.problem_id,
      row.mode,
      row.status,
      row.support_level,
      row.student_state,
      row.step_index,
      row.plan,
      row.internal_answer,
      row.current_route,
      row.stuck_streak,
      row.turn_count,
      row.created_at,
      row.finished_at,
    );

  return toSession(row);
}

export function getSessionInternal(sessionId: string): SessionInternal | null {
  const row = one<SessionRow>("SELECT * FROM sessions WHERE id = ?", sessionId);
  if (!row) return null;
  return {
    id: row.id,
    problemId: row.problem_id,
    mode: row.mode as SessionMode,
    status: row.status as SessionStatus,
    supportLevel: row.support_level as SupportLevel,
    studentState: row.student_state as StudentState | null,
    stepIndex: row.step_index,
    guideMap: parseJson<GuideMap | null>(row.plan, null),
    internalAnswer: row.internal_answer,
    currentRoute: row.current_route,
    stuckStreak: row.stuck_streak,
    turnCount: row.turn_count,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/** 对外视图：internalAnswer 在此被剥离 */
export function getSession(sessionId: string): Session | null {
  const row = one<SessionRow>("SELECT * FROM sessions WHERE id = ?", sessionId);
  return row ? toSession(row) : null;
}

export function listSessions(limit = 20, offset = 0): Session[] {
  const rows = many<SessionRow>(
    "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
    limit,
    offset,
  );
  return rows.map(toSession);
}

export interface UpdateSessionInput {
  status?: SessionStatus;
  supportLevel?: SupportLevel;
  studentState?: StudentState | null;
  stepIndex?: number;
  currentRoute?: string;
  stuckStreak?: number;
  turnCount?: number;
  guideMap?: GuideMap;
  finishedAt?: number | null;
}

export function updateSession(sessionId: string, patch: UpdateSessionInput): void {
  const sets: string[] = [];
  const args: SqlArg[] = [];

  if (patch.status !== undefined) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  if (patch.supportLevel !== undefined) {
    sets.push("support_level = ?");
    args.push(patch.supportLevel);
  }
  if (patch.studentState !== undefined) {
    sets.push("student_state = ?");
    args.push(patch.studentState);
  }
  if (patch.stepIndex !== undefined) {
    sets.push("step_index = ?");
    args.push(patch.stepIndex);
  }
  if (patch.currentRoute !== undefined) {
    sets.push("current_route = ?");
    args.push(patch.currentRoute);
  }
  if (patch.stuckStreak !== undefined) {
    sets.push("stuck_streak = ?");
    args.push(patch.stuckStreak);
  }
  if (patch.turnCount !== undefined) {
    sets.push("turn_count = ?");
    args.push(patch.turnCount);
  }
  if (patch.guideMap !== undefined) {
    sets.push("plan = ?");
    args.push(JSON.stringify(patch.guideMap));
  }
  if (patch.finishedAt !== undefined) {
    sets.push("finished_at = ?");
    args.push(patch.finishedAt);
  }

  if (sets.length === 0) return;

  sqlite
    .prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`)
    .run(...args, sessionId);
}

export function deleteSession(sessionId: string): void {
  sqlite.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  sqlite.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

// ---------- messages ----------

export interface AppendMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  contentType?: MessageContentType;
  state?: StudentState | null;
  supportLevel?: SupportLevel | null;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    contentType: row.content_type as MessageContentType,
    content: row.content,
    state: row.state as StudentState | null,
    supportLevel: row.support_level as SupportLevel | null,
    createdAt: row.created_at,
  };
}

export function appendMessage(input: AppendMessageInput): Message {
  const row: MessageRow = {
    id: id("m"),
    session_id: input.sessionId,
    role: input.role,
    content_type: input.contentType ?? "text",
    content: input.content,
    state: input.state ?? null,
    support_level: input.supportLevel ?? null,
    created_at: now(),
  };

  sqlite
    .prepare(
      `INSERT INTO messages (id, session_id, role, content_type, content, state, support_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.session_id,
      row.role,
      row.content_type,
      row.content,
      row.state,
      row.support_level,
      row.created_at,
    );

  return toMessage(row);
}

export function listMessages(sessionId: string): Message[] {
  return many<MessageRow>(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
    sessionId,
  ).map(toMessage);
}

/** 取最近 n 条，用于拼对话上下文（控 token，R2） */
export function recentMessages(sessionId: string, limit = 8): Message[] {
  const rows = many<MessageRow>(
    "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
    sessionId,
    limit,
  );
  return rows.reverse().map(toMessage);
}
