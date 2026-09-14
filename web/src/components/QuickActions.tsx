import type { QuickAction } from "@jtb/shared";

export interface QuickActionItem {
  action: QuickAction;
  label: string;
}

/** 固定保留的两颗按钮：模型不一定会给，但学生随时可能需要 */
const ALWAYS_AVAILABLE: QuickActionItem[] = [
  { action: "MORE_DETAIL", label: "再讲细一点" },
  { action: "ASK_WHY", label: "为什么这么做" },
];

/**
 * 快捷动作条。
 *
 * 模型给的 quick_replies 是一句句自然语言（"我算出来是 3"），
 * 这里能对上固定动作的就走动作通道（服务端会按动作调节强度），
 * 对不上的当作普通输入发出去 —— 学生的原话比按钮更宝贵。
 */
export function QuickActions({
  suggestions,
  disabled,
  onAction,
  onText,
  canSwitchRoute,
}: {
  suggestions: string[];
  disabled?: boolean;
  onAction: (action: QuickAction) => void;
  onText: (text: string) => void;
  canSwitchRoute?: boolean;
}) {
  const items: QuickActionItem[] = [...ALWAYS_AVAILABLE];
  if (canSwitchRoute) items.push({ action: "SWITCH_ROUTE", label: "换个思路试试" });

  const extras: string[] = [];
  for (const s of suggestions) {
    const action = matchAction(s);
    if (action === "THINK_MORE") continue; // 纯前端动作，不需要出现在这里
    if (action) {
      if (!items.some((i) => i.action === action)) {
        items.push({ action, label: s });
      }
    } else if (!extras.includes(s)) {
      extras.push(s);
    }
  }

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          disabled={disabled}
          onClick={() => onAction(item.action)}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 transition active:scale-95 disabled:opacity-40"
        >
          {item.label}
        </button>
      ))}
      {extras.map((text) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onText(text)}
          className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[13px] text-brand-700 transition active:scale-95 disabled:opacity-40"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** 把自然语言按钮映射到固定动作。模型措辞不稳定，所以用包含匹配而非全等。 */
export function matchAction(text: string): QuickAction | null {
  if (/再(讲)?(细|具体)|再提示|多讲一点|详细(一点|些)/.test(text)) return "MORE_DETAIL";
  if (/为什么|为啥|怎么来的|什么原理|凭什么/.test(text)) return "ASK_WHY";
  if (/直接(讲|告诉|说)|讲这一步|演示/.test(text)) return "EXPLAIN_THIS_STEP";
  if (/换(个|条)?(思路|方法|路)/.test(text)) return "SWITCH_ROUTE";
  if (/自己(再)?想|我自己|不用提示/.test(text)) return "THINK_MORE";
  if (/看(完整)?(答案|解析)|直接给答案/.test(text)) return "SHOW_ANSWER";
  return null;
}
