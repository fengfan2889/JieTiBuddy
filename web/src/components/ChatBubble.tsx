import type { ChatMessageView } from "@/features/chat/useTutorSession";

import { MathText } from "./MathText";
import { StateBadge } from "./StateBadge";

export function ChatBubble({
  message,
  answer = false,
}: {
  message: ChatMessageView;
  /** 整份解析：不塞进对话气泡，而是整幅铺开 —— 一份 2000+ 字的解析挤在 92% 宽的气泡里没法读 */
  answer?: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[15px] leading-relaxed text-white">
          {message.content}
        </div>
      </div>
    );
  }

  if (answer) {
    return (
      <div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200/70">
        <StateBadge state={message.state} level={message.supportLevel} />
        {message.content ? <MathText content={message.content} /> : <TypingDots />}
        {message.streaming && message.content && <TypingDots />}
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-200/70">
        <StateBadge state={message.state} level={message.supportLevel} />
        {message.content ? (
          <MathText content={message.content} />
        ) : (
          <TypingDots />
        )}
        {message.streaming && message.content && <TypingDots />}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
