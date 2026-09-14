import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { ConfirmPage } from "@/pages/ConfirmPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SolvePage } from "@/pages/SolvePage";

/**
 * 用 HashRouter 而非 BrowserRouter：Capacitor 打包后是 file:// 或
 * https://localhost 下的静态资源，history 模式的深链会直接 404。
 */
export function App() {
  return (
    <HashRouter>
      <div className="mx-auto flex h-full min-h-full w-full max-w-[560px] flex-col bg-slate-50">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/solve/:sessionId" element={<SolvePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
