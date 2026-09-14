import type { Problem, Session } from "@jtb/shared";
import { create } from "zustand";

/**
 * 跨页面传递的最小状态。
 * 只放「拍完照还没建会话」这一段中间数据，其余一律以服务端为准。
 */
interface AppState {
  /** 本地预览图（blob URL 或 data URL） */
  imagePreview: string | null;
  /** 原始图片，用于上传 */
  imageBlob: Blob | null;
  problem: Problem | null;
  session: Session | null;

  setImage: (blob: Blob, preview: string) => void;
  setProblem: (problem: Problem) => void;
  setSession: (session: Session) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  imagePreview: null,
  imageBlob: null,
  problem: null,
  session: null,

  setImage: (blob, preview) => set({ imageBlob: blob, imagePreview: preview }),
  setProblem: (problem) => set({ problem }),
  setSession: (session) => set({ session }),
  reset: () => set({ imageBlob: null, imagePreview: null, problem: null, session: null }),
}));
