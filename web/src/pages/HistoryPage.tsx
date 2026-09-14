import type { Session } from "@jtb/shared";
import { SUBJECT_LABEL } from "@jtb/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchSessions } from "@/api/sessions";
import { useAppStore } from "@/store/app";

const STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  solved: "已解出",
  abandoned: "已放弃",
};

export function HistoryPage() {
  const nav = useNavigate();
  const reset = useAppStore((s) => s.reset);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSessions(30)
      .then((res) => {
        if (alive) setSessions(res.sessions);
      })
      .catch((err: unknown) => {
        if (alive) setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={() => nav("/")} className="text-[14px] text-slate-500">
          返回
        </button>
        <h1 className="text-[15px] font-medium text-slate-800">解过的题</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <p className="py-10 text-center text-[13.5px] text-slate-400">加载中…</p>}
        {error && <p className="py-10 text-center text-[13.5px] text-rose-600">{error}</p>}

        {!loading && !error && sessions.length === 0 && (
          <p className="py-16 text-center text-[13.5px] text-slate-400">
            还没有解过的题，去拍一道吧。
          </p>
        )}

        <div className="space-y-2.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                reset();
                nav(`/solve/${s.id}`);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14.5px] font-medium text-slate-800">
                    {s.guideMap ? `${s.guideMap.steps.length} 步引导` : "直接看答案"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${
                      s.status === "solved"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-slate-50 text-slate-500 ring-slate-200"
                    }`}
                  >
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12.5px] text-slate-400">
                  {new Date(s.createdAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {s.guideMap ? " · 引导模式" : " · 直接模式"}
                </p>
              </div>
              <span className="shrink-0 text-slate-300">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
