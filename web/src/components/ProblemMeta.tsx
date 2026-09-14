import type { Problem } from "@jtb/shared";
import { SUBJECT_LABEL } from "@jtb/shared";

import { ModelTag } from "@/components/ModelTag";

/**
 * 题目元信息：学科 / 难度 / 年级 / 知识点 / 读题模型（D24）。
 *
 * 为什么要有这个组件：确认页和解题页必须显示**同一组**信息 ——
 * 同一份信息在两个页面上长成两个样子，是最容易让人对不上号的地方
 * （"确认的时候明明是高三，怎么讲起来不提了"）。共用一份实现就不会走岔。
 *
 * 布局：**单行横向滚动，不换行**。知识点经常是 3~4 个，放任换行会在手机头部
 * 撑出两三行，把本来就宝贵的答题区挤掉；横向滑动是移动端已经习惯的动作。
 * 子项一律 `shrink-0` —— 不然 flex 会把后面的知识点压成一条缝。
 */
export function ProblemMeta({
  problem,
  vlModel,
  hideSubject = false,
  wrap = false,
  className = "",
}: {
  problem: Problem;
  /** 读题模型名。解题页标题栏已经带了解题模型，这里补的是「读这张图的那一个」 */
  vlModel?: string | null;
  /** 解题页的标题就是学科，不必再来一颗重复的 */
  hideSubject?: boolean;
  /** 确认页空间宽裕，换行反而看得全；解题页头部要省高度，改成单行横滑 */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        wrap
          ? "flex-wrap"
          : "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      } ${className}`}
    >
      {!hideSubject && <Meta label="学科" value={SUBJECT_LABEL[problem.subject]} />}
      <Meta label="难度" value={`${problem.difficulty}/5`} />
      {problem.gradeHint && <Meta label="年级" value={problem.gradeHint} />}
      {problem.knowledgePoints.map((kp) => (
        <Meta key={kp} label="知识点" value={kp} />
      ))}
      {vlModel && <ModelTag role="读题" name={vlModel} className="shrink-0" />}
    </div>
  );
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12.5px] ring-1 ring-inset ring-slate-200">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </span>
  );
}
