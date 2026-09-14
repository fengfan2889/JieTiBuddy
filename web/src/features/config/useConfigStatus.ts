import type { ConfigStatus } from "@jtb/shared";
import { useCallback, useEffect, useState } from "react";

import { fetchConfigStatus } from "@/api/config";

/**
 * 当前接入状态（用哪家公司、填没填密钥、读题/解题各用什么模型）。
 * 首页用它决定要不要显示「还差一步」的引导条，设置页用它渲染状态卡。
 */
export function useConfigStatus() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchConfigStatus());
    } catch {
      // 后端没起来时不该挡住整个页面 —— 首页照常能拍照，报错留到上传那一步
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, setStatus, loading, refresh };
}
