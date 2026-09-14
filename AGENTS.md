# 项目开发规则 - 解题伙伴（JieTiBuddy）

> 继承全局规范：`F:\jyw\OneDrive\backup\opencode\20260826\AGENTS.md`
> 本文件为项目级规则，如与全局规范冲突，以更严格者为准。

## 文档维护规则

### 开发日志更新（每次开发必须）

每次开发会话结束时，必须更新 `doc/开发日志.md`：

1. 在文件末尾添加新的开发记录
2. 记录日期时间、任务目标、文件变更、当前状态
3. 如有阻塞问题，在备注中说明

### 设计文档更新（架构变更时）

当发生以下情况时更新 `doc/设计文档.md`：

- 新增/删除核心模块
- 技术栈变更
- 架构调整
- 关键决策变更
- 提示词（System Prompt）结构性调整

### 开发计划更新（任务状态变更时）

当任务完成或计划调整时更新 `doc/开发计划.md`：

- 标记已完成任务
- 调整优先级
- 添加新任务

## 打开项目命令记录规则

每次打开已有项目继续开发时，必须将打开项目的命令行语句写入开发日志：

```bash
opencode f:\jyw\study\android\JieTiBuddy
```

## 设计先行规则（Design-First Workflow）

**在开始任何开发工作之前，必须先完成设计文档的编写和人工确认。**

```
用户需求 → 设计文档初稿 → 多轮迭代评审 → 人工确认 → 开始开发
```

| 规则 | 说明 |
|------|------|
| 🚫 禁止跳过设计 | 未经设计文档确认，不得开始编码 |
| 🚫 禁止擅自决策 | 关键技术选型必须经过评审和确认 |
| ✅ 必须多轮迭代 | 设计文档可能需要多次修改才能完善 |
| ✅ 必须人工确认 | 最终设计必须由用户明确批准 |
| ✅ 变更需重新确认 | 开发中设计变更需重新评审和确认 |

## 日志规范

**记录错误时必须包含 stacktrace**：

- TypeScript / Node.js：`logger.error({ err }, "message")`（pino），确保输出 `err.stack`
- 前端：`console.error(err)` 输出完整堆栈，禁止只打印 `err.message`
- 开发日志中记录错误时，必须附上 stacktrace 关键片段

## 升级备份规则

**在进行以下升级操作前，必须先备份数据库和文档到 `F:\jyw\backup\JieTiBuddy\{日期}_{时间}\`：**

- 数据库文件（`*.db` / `*.sqlite` / `*.sql`）
- `doc/` 目录下所有文档
- `AGENTS.md`
- `server/src/prompts/` 下的提示词文件

保留最近 **10 次** 备份。

触发时机：数据库结构变更、提示词重构、文档大幅重构、项目迁移或重构。

## 项目专属约定

### 目录职责

| 目录 | 职责 | 说明 |
|------|------|------|
| `doc/` | 项目文档 | 设计文档、开发计划、开发日志、提示词设计 |
| `web/` | 前端 | React + TypeScript + Vite + Tailwind CSS |
| `server/` | 后端 | Node.js + Fastify，模型调用与密钥托管 |
| `shared/` | 共享代码 | 前后端共用的 TypeScript 类型与常量 |
| `android/` | 安卓工程 | 由 Capacitor 生成，**不手改**，改动走 `capacitor sync` |

### 安全红线

- 🔴 **AI 模型 API Key 只允许存在于 `server/.env`**，禁止提交到仓库、禁止出现在前端产物中
- 🔴 设置页（`web/src/pages/SettingsPage.tsx`）可以把 Key 交给后端写入 `server/.env`，
  但**前端不得把 Key 存进 localStorage / sessionStorage / Cookie**，接口也只能返回脱敏值（`sk-abc****wxyz`）
- 🔴 `PUT /api/config` 的私网来源校验（`server/src/routes/config.ts` 的 `isLocalRequest`）
  不得删除或放宽；公网部署必须前置带鉴权的反向代理
- 🔴 前端不得直连模型厂商域名，所有模型调用必须经 `server/` 代理
- 🔴 **`server/src/providers/catalog.ts` 是「支持哪些模型公司」的唯一事实来源**。
  加一家公司 = 在 catalog 加一条记录 + 在 `shared` 的 `LlmProviderName` 加 id，
  禁止在路由 / 工厂 / 页面里再写 `if (provider === 'xxx')`
- 🔴 每家公司**各存一把密钥**（`DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY`），切换公司不得覆盖另一家的
- 🔴 `server/src/prompts/analyze.md` 里「**公式必须用 `$...$` 包裹**」与「按原题排版分行」
  是**并列的两条硬要求**，删掉或弱化任何一条，题干都会退化成裸 LaTeX
  （界面上就是一屏 `\frac` 反斜杠）。**改完提示词必须拿真图跑一次识别验证**，不能只看 typecheck 过
- 🔴 读题模型的默认值是 `qwen-vl-max`：读图是「OCR + 归类」，**不要为了"更强"换成通用旗舰**
  （实测 `qwen3.8-max` 贵 7.5 倍、慢 2 倍，识别质量没有提升）
- 🔴 **`web/src/lib/latex.ts` 里的纯文本转换函数必须有单测**（`latex.test.ts`）。
  它们跑在渲染链路最前面，出错时模型再准也白搭。踩过的坑：`normalizeBareLatex` 逐行补 `$` 时
  把跨行 `$$…$$` 块的公式源也包上了 `$` → `$…$` 原样漏到界面上（4 条真实解析残留 `$` 从 0 涨到 108+）。
  **给这类函数加规则时，既要验它该动的情况，也要验它不该动的情况。**
- 🔴 题干编辑态**不得把 LaTeX 原文暴露给学生**（`ProblemEditor`）：
  文字正常编辑、公式是 `contenteditable=false` 的 KaTeX 卡片。存回去仍是 `$…$`，
  **数据库格式不变**；改这块时别把编辑器序列化出来的文本形状改掉（往返测试会拦）
- 🔴 `.env` 已在 `.gitignore` 中，任何情况下不得移除
- 🔴 用户上传的题目图片属于未成年人学习数据，日志中禁止输出图片 base64 与完整题目原文

> 关于「没配置 Key」：后端**不再在启动时 `process.exit`**（否则填 Key 的页面都打不开）。
> 拦截点下沉到 `getProvider()` 抛 `NoApiKeyError` → 接口回 `503 NO_API_KEY` → 前端引导到设置页。
> 同时 `.env.example` 里的 `sk-xxxxxxxx` 这类占位符必须被 `looksLikePlaceholder()` 识别为「未配置」，
> 否则会出现「首页显示已接入、拍照时才炸 401」的假象。

### 代码规范

- TypeScript 开启 `strict`，禁止 `any` 逃逸（必要时需注释说明理由）
- 提交前必须 `npm run typecheck` 通过（三个 workspace 全量）
- 提示词统一放在 `server/src/prompts/*.md`，**修改提示词视为设计变更**，需同步更新设计文档
- 包管理用 **npm workspaces**（本机无 pnpm）；新增依赖写在对应 workspace 的 `package.json`，
  不要装到根目录
- 🔴 **禁止引入需要本地编译的原生模块**（`better-sqlite3` / `canvas` / `sharp` 之类）。
  原生模块按 Node 的 ABI 编译，**装依赖的 Node 与跑服务的 Node 版本不一致就会
  `ERR_DLOPEN_FAILED`**（本项目已因此崩过一次，见 R14）。
  数据库一律用 Node 内置的 `node:sqlite`；需要其他能力时先找纯 JS 方案。
- 运行时要求 **Node ≥ 22.13**（各 `package.json` 的 `engines` 已声明）；
  安装依赖与启动服务请使用同一个 Node，避免再出现「装用 22、跑用 24」这类问题

### 产品红线（核心价值不可违背）

引导式解题的 System Prompt 中「不直接给答案」的约束是**产品核心价值**，
任何为了让回答"更好用"而绕过该约束的改动，必须先经用户确认。

🔴 **同级红线：学生说"不会"时，绝不允许出现空泛话术。**

`你再想想` / `仔细读读题` / `先自己试试` / `动动脑筋` / 无铺垫的空反问，
一律判为不合格输出。三层防护缺一不可，任何一层都不得删除或弱化：

1. 提示词红线 —— `server/src/prompts/tutor.system.md`
2. 后置黑名单校验 —— `server/src/engine/guard.ts`
3. 二次命中后的降级 —— 用当前步 `analysis + approach` 模板拼接兜底

修改任何一层，都必须同步更新 `server/src/engine/guard.test.ts`。

**语义提醒（极易踩错）**：支持强度 `S0~S3` 中，升档 = **更具体**，不是"更接近答案"；
`S0` 本身就是信息量充足的档位（分析 + 思路），**不存在"什么都不给"的低档**。
实现时若沿用"强度低 = 信息少"的直觉，会把产品做废。
