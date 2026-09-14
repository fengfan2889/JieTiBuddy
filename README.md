# 解题伙伴 JieTiBuddy

面向高中生的拍照解题 AI 应用。**教思考，不代写作业。**

拍照上传不会做的题 → AI 多轮启发式引导 → 学生自己解出 → 输出完整解析与知识点。

> 核心红线：**引导模式（guide）下永不输出最终答案。** 这是架构约束，不是文案。

## 环境要求

- **Node.js ≥ 22.13**（用到了内置的 `node:sqlite`）
- 不需要安装编译器/构建工具

> 项目**不依赖任何需要本地编译的原生模块**（原生模块按 Node ABI 编译，换个 Node 版本就会报 `ERR_DLOPEN_FAILED`），
> 所以 Node 22 / 24 都能直接跑。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Tailwind CSS + Vite，Capacitor 打包 Android |
| 后端 | Node.js + Fastify（薄代理，Key 不落客户端） |
| 模型 | 通义千问-VL（qwen-vl-max / DashScope），Provider 层可换 |
| 存储 | Node 内置 `node:sqlite` + 手写 SQL（MVP，无原生依赖） |

## 快速开始

```bash
npm install
cp .env.example server/.env     # 可选：也可以启动后在网页里填

npm run dev:server              # http://localhost:8787
npm run dev:web                 # http://localhost:5173
```

首次使用时，在网页首页点右上角齿轮进入「接入 AI 模型」页填 API Key；
要装到手机上，在同一个页面填「服务地址」（运行服务那台电脑的局域网地址）。

## 常用命令

```bash
npm run typecheck               # 三个 workspace 全量类型检查
npm test                        # 后端单测 + 提示词守卫用例
npm run build:web               # 构建前端产物
npm run android:add             # 首次生成 android 工程
npm run android:sync            # 构建前端并同步进 Android 工程
npm run android:open            # 打开 Android Studio
```

## 文档

| 文件 | 内容 |
|---|---|
| `doc/设计文档.md` | 架构、数据模型、接口、决策记录、风险清单 |
| `doc/系统提示词-引导式解题.md` | 核心资产：主提示词 + analyze + plan + summarize + 验证用例 |
| `doc/开发计划.md` | 分阶段任务清单 |
| `doc/开发日志.md` | 每次会话的工作记录 |
| `AGENTS.md` | 开发规则（继承全局规范） |

## 目录

```
shared/   前后端共享类型与常量
web/      前端（Vite + React）
server/   后端（Fastify + 引导引擎 + 提示词）
android/  Capacitor 生成，不手改
```
