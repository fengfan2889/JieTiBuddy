/// <reference types="vite/client" />

// 与 vite/client 内置的 ImportMetaEnv 合并，不重新声明 ImportMeta
interface ImportMetaEnv {
  /** 后端地址。留空则走同源 + vite 代理（开发时推荐） */
  readonly VITE_API_BASE?: string;
}
