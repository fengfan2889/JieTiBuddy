import type { Problem, Subject } from "@jtb/shared";

import { api } from "./client";

export interface ProblemResponse {
  problem: Problem;
}

export function uploadProblem(blob: Blob, filename?: string): Promise<ProblemResponse> {
  return api.upload<ProblemResponse>("/api/problems", blob, filename);
}

export function fetchProblem(id: string): Promise<ProblemResponse> {
  return api.get<ProblemResponse>(`/api/problems/${id}`);
}

export interface ProblemPatch {
  ocrText?: string;
  ocrLatex?: string[];
  subject?: Subject;
  difficulty?: number;
  knowledgePoints?: string[];
  ocrConfirmed?: boolean;
}

export function patchProblem(id: string, patch: ProblemPatch): Promise<ProblemResponse> {
  return api.patch<ProblemResponse>(`/api/problems/${id}`, patch);
}

export function reanalyzeProblem(
  id: string,
  imageBase64: string,
  mime: string,
): Promise<ProblemResponse> {
  return api.post<ProblemResponse>(`/api/problems/${id}/analyze`, { imageBase64, mime });
}
