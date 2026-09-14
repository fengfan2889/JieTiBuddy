import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { useCallback, useState } from "react";

export interface PickedImage {
  blob: Blob;
  previewUrl: string;
}

export type PickSource = "camera" | "gallery";

/**
 * 取图：原生端走 Capacitor Camera，浏览器端降级为 input[type=file]。
 * 这条降级路径让开发期在 Chrome 里能直接跑，不必每次都装 APK。
 */
export function useCamera() {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async (source: PickSource): Promise<PickedImage | null> => {
    setPicking(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) return await pickNative(source);
      return await pickWeb(source);
    } catch (err) {
      const message = (err as Error).message ?? "取图失败";
      // 用户主动取消不算错误
      if (/cancel/i.test(message)) return null;
      setError(message);
      return null;
    } finally {
      setPicking(false);
    }
  }, []);

  return { pick, picking, error };
}

async function pickNative(source: PickSource): Promise<PickedImage | null> {
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    width: 1600,
    correctOrientation: true,
  });

  if (!photo.dataUrl) return null;
  const blob = await (await fetch(photo.dataUrl)).blob();
  return { blob, previewUrl: photo.dataUrl };
}

function pickWeb(source: PickSource): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // 手机上直接唤起后置摄像头
    if (source === "camera") input.capture = "environment";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ blob: file, previewUrl: URL.createObjectURL(file) });
    };
    // 🔴 用户取消时必须 resolve(null)：否则 picking 永远停在 true，
    // 「重拍」按钮一辈子是灰的（屏幕上只有这一个出口，卡住就是死锁）。
    input.oncancel = () => resolve(null);
    // 老浏览器没有 cancel 事件，退回窗口时再兜一次；此时若仍没选中文件即视为取消
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
      }, 300);
    };
    window.addEventListener("focus", onFocus);

    input.click();
  });
}
