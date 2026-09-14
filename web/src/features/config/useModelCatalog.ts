import type { LlmProviderName, ModelCatalog } from "@jtb/shared";
import { useCallback, useEffect, useState } from "react";

import { fetchModelCatalog } from "@/api/config";

/**
 * 模型下拉的数据源。列表由后端调各家公司的接口取，
 * 取不到会自动回退成内置候选并把原因放在 catalog.message 里 —— 前端只负责显示。
 */
export function useModelCatalog(provider: LlmProviderName | undefined) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: LlmProviderName, refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await fetchModelCatalog(id, { refresh }));
    } catch (err) {
      setCatalog(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!provider) return;
    void load(provider);
  }, [provider, load]);

  return { catalog, loading, error, reload: load };
}
