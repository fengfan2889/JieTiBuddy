import type { StudentState, SupportLevel } from "@jtb/shared";
import { SUPPORT_LEVEL_LABEL } from "@jtb/shared";

const STATE_STYLE: Record<StudentState, { label: string; className: string }> = {
  CORRECT: { label: "答对了", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PARTIAL: { label: "方向对了一半", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  WRONG: { label: "这一步有问题", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  STUCK: { label: "卡住了", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  OFF_TRACK: { label: "跑偏了", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  WANTS_ANSWER: { label: "想看答案", className: "bg-violet-50 text-violet-700 ring-violet-200" },
  ASK_WHY: { label: "在问为什么", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  SOLVED: { label: "解出来了", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

/**
 * 状态徽标 + 支持强度。
 *
 * 强度标签刻意写成「S0 分析 + 思路」这种描述性文字而不是数字 ——
 * 让学生（和家长）看懂"老师给的是思路，不是答案"。
 */
export function StateBadge({
  state,
  level,
}: {
  state?: StudentState | null;
  level?: SupportLevel | null;
}) {
  const style = state ? STATE_STYLE[state] : null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {style && (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.className}`}
        >
          {style.label}
        </span>
      )}
      {level !== null && level !== undefined && (
        <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-inset ring-slate-200">
          S{level} {SUPPORT_LEVEL_LABEL[level]}
        </span>
      )}
    </div>
  );
}
