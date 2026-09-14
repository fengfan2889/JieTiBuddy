/**
 * shared 转发模块。
 *
 * 不用包名 `@jtb/shared` 导入，是为了让 tsx 直接转译 shared 下的 TS 源码 ——
 * 装进 node_modules 的包不会走 tsx 的转译管线。一个转发文件换掉整条构建依赖链。
 */
export * from "../../shared/src/index.js";
