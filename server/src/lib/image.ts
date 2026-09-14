import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "./logger.js";

/** 服务端只留缩略图，原图留在客户端（D8：降存储成本 + 未成年人数据合规） */
const THUMB_MAX_EDGE = 1024;

export interface SaveImageResult {
  /** 相对路径，存入 problems.imagePath */
  relativePath: string;
  /** data URL，供当次分析直接喂给多模态模型 */
  dataUrl: string;
}

/**
 * MVP 不做图像压缩（避免引入 sharp 原生依赖）。
 * 保留接口形状，Phase 2 换 sharp 时只改这一处。
 */
export async function saveImage(
  buffer: Buffer,
  mime: string,
  uploadRoot = "./data/uploads",
): Promise<SaveImageResult> {
  const ext = mimeToExt(mime);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const relativePath = join("uploads", name);
  const absolutePath = join(uploadRoot, name);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  logger.debug("image saved", { absolutePath, bytes: buffer.length });

  return {
    relativePath,
    dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
  };
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

export { THUMB_MAX_EDGE };
