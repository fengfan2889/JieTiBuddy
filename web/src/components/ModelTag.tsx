/**
 * 模型名标签 —— 界面上凡是「这次是谁干的活」的地方都挂一个。
 *
 * 为什么要把模型名摆到界面上：读题效果不好时，第一件事就是确认到底在用哪个模型。
 * 藏进设置页等于每次都要点三层才看得到，出了问题根本对不上号。
 */
export function ModelTag({
  name,
  role,
  className = "",
}: {
  /** 传给模型接口的模型名，如 qwen-vl-max */
  name: string;
  /** 角色前缀：读题 / 解题。不给就只显示模型名 */
  role?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12.5px] ring-1 ring-inset ring-slate-200 ${className}`}
    >
      {role && <span className="shrink-0 text-slate-400">{role}</span>}
      <span className="truncate font-mono text-[12px] text-slate-700">{name}</span>
    </span>
  );
}
