import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";

import { normalizeBareLatex } from "@/lib/latex";

/**
 * 题目与解析里满是公式，必须走 KaTeX 渲染而不是当纯文本显示。
 * 提示词里约定公式用 $...$ / $$...$$，正好对上 remark-math 的语法。
 *
 * remark-breaks 不可省：Markdown 默认把**单个换行**折叠成空格，
 * 而识别回来的题干是按原题排版的（题号 / 条件 / 小问各占一行）。
 * 不启用它，学生看到的题干就会挤成一坨。
 *
 * normalizeBareLatex 是第二道防线：模型偶尔漏写 `$`，裸 LaTeX 会显示成
 * 一屏反斜杠。清洗逻辑见 `@/lib/latex`。
 */
export function MathText({ content }: { content: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizeBareLatex(content)}
      </ReactMarkdown>
    </div>
  );
}
