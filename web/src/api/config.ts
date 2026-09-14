import type {
  ConfigStatus,
  LlmProviderName,
  ModelCatalog,
  SaveConfigRequest,
  VerifyApiKeyResult,
} from "@jtb/shared";

import { api } from "./client";

export function fetchConfigStatus(): Promise<ConfigStatus> {
  return api.get<ConfigStatus>("/api/config");
}

/** 局部更新：只传要改的字段（切换公司 / 保存密钥 / 换模型都走这里） */
export function saveConfig(patch: SaveConfigRequest): Promise<ConfigStatus> {
  return api.put<ConfigStatus>("/api/config", patch);
}

export function fetchModelCatalog(
  provider?: LlmProviderName,
  opts: { refresh?: boolean } = {},
): Promise<ModelCatalog> {
  const query = new URLSearchParams();
  if (provider) query.set("provider", provider);
  if (opts.refresh) query.set("refresh", "1");

  const suffix = query.toString();
  return api.get<ModelCatalog>(`/api/config/models${suffix ? `?${suffix}` : ""}`);
}

export function verifyApiKey(): Promise<VerifyApiKeyResult> {
  return api.post<VerifyApiKeyResult>("/api/config/verify");
}
