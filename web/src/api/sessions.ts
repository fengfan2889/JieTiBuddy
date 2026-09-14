import type { Message, QuickAction, Session, SessionMode } from "@jtb/shared";

import type { SseHandlers } from "./client";
import { api, postSse } from "./client";

export interface SessionResponse {
  session: Session;
}

export interface SessionDetailResponse {
  session: Session;
  messages: Message[];
}

export function createSession(problemId: string, mode: SessionMode): Promise<SessionResponse> {
  return api.post<SessionResponse>("/api/sessions", { problemId, mode });
}

export function fetchSession(id: string): Promise<SessionDetailResponse> {
  return api.get<SessionDetailResponse>(`/api/sessions/${id}`);
}

export function fetchSessions(limit = 20, offset = 0): Promise<{ sessions: Session[] }> {
  return api.get<{ sessions: Session[] }>(`/api/sessions?limit=${limit}&offset=${offset}`);
}

/** 首轮：路径预告 + 第一步引导 */
export function startSession(
  id: string,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/api/sessions/${id}/start`, {}, handlers, signal);
}

export function sendMessage(
  id: string,
  content: string,
  handlers: SseHandlers,
  action?: QuickAction,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/api/sessions/${id}/messages`, { content, action }, handlers, signal);
}

export function sendHint(
  id: string,
  action: QuickAction,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return postSse(`/api/sessions/${id}/hint`, { action }, handlers, signal);
}

export function finalizeSession(id: string): Promise<{ text: string; isSolved: boolean }> {
  return api.post<{ text: string; isSolved: boolean }>(`/api/sessions/${id}/finalize`);
}

export function deleteSession(id: string): Promise<{ deleted: boolean }> {
  return api.del<{ deleted: boolean }>(`/api/sessions/${id}`);
}
