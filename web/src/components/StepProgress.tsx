/**
 * 分步进度。
 *
 * 只显示"走到第几步"，不显示"还剩几步要看答案" ——
 * 进度条的语义是"你在往前走"，不是"快看到答案了"。
 */
export function StepProgress({
  stepIndex,
  totalSteps,
  stepGoal,
}: {
  stepIndex: number;
  totalSteps: number;
  stepGoal?: string;
}) {
  if (totalSteps <= 1) return null;

  const safeIndex = Math.min(Math.max(stepIndex, 1), totalSteps);
  const percent = Math.round((safeIndex / totalSteps) * 100);

  return (
    <div className="border-b border-slate-200/80 bg-white/90 px-4 py-2 backdrop-blur">
      <div className="flex items-center justify-between text-[12px] text-slate-500">
        <span className="truncate pr-3">{stepGoal || "正在推进"}</span>
        <span className="shrink-0 tabular-nums">
          第 {safeIndex} / {totalSteps} 步
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
