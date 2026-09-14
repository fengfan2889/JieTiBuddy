import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { isNoApiKeyError } from "@/api/client";
import { uploadProblem } from "@/api/problems";
import { ModelTag } from "@/components/ModelTag";
import { useAppStore } from "@/store/app";
import { useCamera } from "@/features/capture/useCamera";
import { useConfigStatus } from "@/features/config/useConfigStatus";

export function HomePage() {
  const nav = useNavigate();
  const { pick, picking } = useCamera();
  const { status } = useConfigStatus();
  const imagePreview = useAppStore((s) => s.imagePreview);
  const imageBlob = useAppStore((s) => s.imageBlob);
  const setImage = useAppStore((s) => s.setImage);
  const setProblem = useAppStore((s) => s.setProblem);
  const reset = useAppStore((s) => s.reset);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 后端没起来时 status 为 null，这时不误报「没配密钥」 */
  const needsSetup = status !== null && !status.configured;

  /**
   * 取图后**直接识别**（D23）：拍完/选完这一张就开始读题，不再让用户多点一次「识别这道题」。
   * 取图这一步本身已经是用户的确认动作了 —— 再要一次点击只是多余的关卡。
   */
  async function choose(source: "camera" | "gallery") {
    // 没配密钥时拍了也识别不了，别让人白拍一张
    if (needsSetup) {
      nav("/settings");
      return;
    }
    setError(null);
    const picked = await pick(source);
    // 用户取消拍照/选图：保留屏幕上原来那张，不清空
    if (!picked) return;
    reset();
    setImage(picked.blob, picked.previewUrl);
    await recognize(picked.blob);
  }

  /** blob 缺省时取 store 里那张 —— 识别失败后的「重新识别」走这条路 */
  async function recognize(blob: Blob | null = imageBlob) {
    if (!blob) return;
    setUploading(true);
    setError(null);
    try {
      const { problem } = await uploadProblem(blob, "problem.jpg");
      setProblem(problem);
      nav("/confirm");
    } catch (err) {
      // 缺密钥不是「识别失败」，是还没配置 —— 直接把孩子（家长）带到设置页
      if (isNoApiKeyError(err)) {
        nav("/settings");
        return;
      }
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 pt-10">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">解题伙伴</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
            拍下不会的题，我陪你一步步想出来。
            <br />
            <span className="text-slate-400">不给答案，给思路。</span>
          </p>

          {/* 当前用哪个模型，摆在首页一眼能看到；点一下去换 */}
          {status && (
            <button
              type="button"
              onClick={() => nav("/settings")}
              className="mt-2.5 flex flex-wrap items-center gap-1.5 text-left active:scale-[0.99]"
            >
              <span className="text-[12px] text-slate-400">当前模型</span>
              <ModelTag role="读题" name={status.vlModel} />
              <ModelTag role="解题" name={status.textModel} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => nav("/settings")}
          aria-label="接入 AI 模型"
          className="relative mt-0.5 shrink-0 rounded-full bg-white p-2.5 text-[17px] leading-none shadow-sm ring-1 ring-slate-200 active:scale-95"
        >
          <span aria-hidden>⚙️</span>
          {needsSetup && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-slate-50" />
          )}
        </button>
      </header>

      {needsSetup && (
        <button
          type="button"
          onClick={() => nav("/settings")}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left ring-1 ring-inset ring-amber-200 active:scale-[0.99]"
        >
          <span className="text-lg" aria-hidden>
            🔑
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-amber-900">还差一步就能用了</span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-amber-700">
              点这里填一下 AI 密钥，填完就能拍照解题
            </span>
          </span>
          <span className="shrink-0 text-amber-400" aria-hidden>
            ›
          </span>
        </button>
      )}

      {imagePreview ? (
        <div className="flex flex-1 flex-col">
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <img src={imagePreview} alt="题目预览" className="max-h-[46vh] w-full object-contain" />

            {/* 识别中：把状态压在图上，而不是占一个按钮位 —— 一眼就知道「这张正在读」 */}
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-900/45">
                <span className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
                <span className="text-[13.5px] font-medium text-white">正在读题、认公式…</span>
                <span className="text-[12px] text-white/70">大约需要几秒</span>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-xl bg-rose-50 px-3.5 py-3 ring-1 ring-inset ring-rose-200">
              <p className="text-[13px] leading-relaxed text-rose-700">{error}</p>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void choose("camera")}
              disabled={uploading || picking}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-[15px] text-slate-700 active:scale-[0.98] disabled:opacity-50"
            >
              重拍
            </button>
            {/* 只有在「识别失败」时才需要手动再来一次；走通了就直接进确认页 */}
            {error && !uploading && (
              <button
                type="button"
                onClick={() => void recognize()}
                className="flex-[1.4] rounded-xl bg-brand-600 py-3 text-[15px] font-medium text-white active:scale-[0.98] disabled:opacity-60"
              >
                重新识别
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <button
            type="button"
            onClick={() => void choose("camera")}
            disabled={picking}
            className="flex items-center gap-4 rounded-2xl bg-brand-600 px-5 py-5 text-left text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="text-2xl">📷</span>
            <span>
              <span className="block text-[16px] font-medium">拍照解题</span>
              <span className="mt-0.5 block text-[12.5px] text-white/75">
                对准题目，拍清楚就行
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void choose("gallery")}
            disabled={picking}
            className="flex items-center gap-4 rounded-2xl bg-white px-5 py-5 text-left shadow-sm ring-1 ring-slate-200 transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="text-2xl">🖼️</span>
            <span>
              <span className="block text-[16px] font-medium text-slate-800">从相册选</span>
              <span className="mt-0.5 block text-[12.5px] text-slate-400">
                截图、练习册照片都行
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => nav("/history")}
            className="mt-2 self-center text-[13.5px] text-slate-400 underline-offset-4 active:underline"
          >
            看看之前解过的题
          </button>
        </div>
      )}
    </div>
  );
}
