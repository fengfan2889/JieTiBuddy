import type { LlmProviderName, ModelOption, VerifyApiKeyResult } from "@jtb/shared";
import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ApiError,
  defaultBase,
  getApiBaseOverride,
  resolveApiUrl,
  setApiBaseOverride,
} from "@/api/client";
import { saveConfig, verifyApiKey } from "@/api/config";
import { useConfigStatus } from "@/features/config/useConfigStatus";
import { useModelCatalog } from "@/features/config/useModelCatalog";

type Busy = null | "save" | "test" | "config";

export function SettingsPage() {
  const nav = useNavigate();
  const { status, setStatus } = useConfigStatus();

  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyApiKeyResult | null>(null);

  const [baseDraft, setBaseDraft] = useState(() => getApiBaseOverride());
  const [baseNote, setBaseNote] = useState<string | null>(null);

  const provider = status?.provider;
  const info = status?.providers.find((p) => p.id === provider) ?? null;
  const providerName = info?.label ?? "通义千问";
  const ready = status?.configured === true;

  const { catalog, loading: catalogLoading, error: catalogError, reload } = useModelCatalog(provider);

  /** 切换公司 / 换模型都走同一个口，统一置忙并清掉上一次的结果 */
  async function apply(patch: Parameters<typeof saveConfig>[0]) {
    if (busy) return;
    setBusy("config");
    setError(null);
    setResult(null);
    try {
      setStatus(await saveConfig(patch));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function applyRecommended() {
    if (!catalog) return;
    const vl = catalog.vl.find((m) => m.recommended)?.id;
    const text = catalog.text.find((m) => m.recommended)?.id;
    if (!vl && !text) return;
    await apply({ vlModel: vl, textModel: text });
  }

  /**
   * 存密钥并顺手测一次连接。
   *
   * 已经配过密钥时**允许留空保存**：不填就是「沿用已经存下的那一把」，
   * 前端干脆不把 apiKey 发出去，后端便不会碰它。这样只想验一下连通性、
   * 或者刚换完模型想顺手确认一下的人，不必把密钥重新粘一遍。
   */
  async function saveAndTest() {
    const trimmed = key.trim();
    if (busy) return;
    if (!trimmed && !ready) return; // 一把都没有，无从「沿用」

    // 没填密钥时这一趟只做「测」，别显示成「正在保存…」——屏幕上写什么就要真的在做什么
    setBusy(trimmed ? "save" : "test");
    setError(null);
    setResult(null);
    try {
      if (trimmed) {
        setStatus(await saveConfig({ apiKey: trimmed }));
        setKey("");
        // 填了密钥才问得到完整模型列表，这里顺手重新取一次
        if (provider) void reload(provider, true);

        // 存完顺手测一次 —— 让「填完了但填错了」在这一屏就暴露，别等到孩子拍照时才发现
        setBusy("test");
      }
      setResult(await verifyApiKey());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (busy) return;
    setBusy("test");
    setError(null);
    setResult(null);
    try {
      setResult(await verifyApiKey());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveBase() {
    if (busy) return;
    setApiBaseOverride(baseDraft);
    setBaseNote(baseDraft.trim() ? "已保存，之后的请求都走这个地址" : "已恢复默认，跟随当前网页地址");
    setError(null);

    // 地址改完、密钥又已配置时，顺手验一次 —— 地址打错在这一屏就能发现
    if (!ready) return;
    setBusy("test");
    setResult(null);
    try {
      setResult(await verifyApiKey());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function resetBase() {
    setApiBaseOverride("");
    setBaseDraft("");
    setBaseNote("已恢复默认，跟随当前网页地址");
    setError(null);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={() => nav("/")} className="text-[14px] text-slate-500">
          返回
        </button>
        <h1 className="text-[15px] font-medium text-slate-800">接入 AI 模型</h1>
      </header>

      <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        <p className="px-1 text-[13px] leading-relaxed text-slate-500">
          「解题伙伴」自己不会看题，它把照片交给大模型来读。所以要先给它一把密钥，
          相当于给孩子开一个可以访问模型的账号。
        </p>

        {/* ---- 当前状态 ---- */}
        <section
          className={`rounded-2xl p-4 shadow-sm ring-1 ring-inset ${
            ready ? "bg-white ring-slate-200" : "bg-amber-50 ring-amber-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[15px]">{ready ? "✅" : "🔑"}</span>
            <span
              className={`text-[15px] font-medium ${ready ? "text-slate-800" : "text-amber-900"}`}
            >
              {ready ? `已接入 · ${providerName}` : "还没接入"}
            </span>
          </div>

          {ready && status ? (
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <Row label="读题" value={status.vlModel} />
              <Row label="解题" value={status.textModel} />
              <Row label="密钥" value={status.masked} />
            </dl>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-amber-800">
              填上密钥，孩子就能拍照解题了。下面三步大约两分钟。
            </p>
          )}

          {ready && status?.persisted === false && (
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
              密钥没能写进 server/.env（文件可能只读或被占用），现在只在这次运行里有效。
              重启服务后需要重新填一次。
            </p>
          )}

          {ready && (
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={busy !== null}
              className="mt-3.5 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-[13.5px] text-slate-600 active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "test" ? "正在测试…" : "测试一下连接"}
            </button>
          )}
        </section>

        {/* ---- 模型 ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-medium text-slate-500">模型</h2>
            <span className="shrink-0 text-[11.5px] text-slate-400">
              {catalogLoading
                ? "正在获取…"
                : catalog?.source === "remote"
                  ? "列表来自接口"
                  : catalog
                    ? "内置候选"
                    : ""}
            </span>
          </div>

          {!status ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-amber-700">
              连不上服务，读不到当前配置。先确认跑服务的那个窗口还开着。
            </p>
          ) : (
            <>
              <div className="mt-3">
                <Field label="模型公司" hint="换一家公司，就要换成那家的密钥">
                  <Select
                    value={status.provider}
                    disabled={busy !== null}
                    onChange={(v) => void apply({ provider: v as LlmProviderName })}
                    options={status.providers.map((p) => ({
                      value: p.id,
                      label: p.configured ? p.label : `${p.label}（还没填密钥）`,
                    }))}
                  />
                </Field>
              </div>

              <div className="mt-3.5">
                <Field label="读题模型" hint="要看得懂图片，所以只列支持图片的模型">
                  <Select
                    value={status.vlModel}
                    disabled={busy !== null}
                    onChange={(v) => void apply({ vlModel: v })}
                    options={toOptions(catalog?.vl ?? [])}
                  />
                </Field>
                <Note of={catalog?.vl} current={status.vlModel} />
              </div>

              <div className="mt-3.5">
                <Field label="解题模型" hint="引导讲解、直接给答案都用它">
                  <Select
                    value={status.textModel}
                    disabled={busy !== null}
                    onChange={(v) => void apply({ textModel: v })}
                    options={toOptions(catalog?.text ?? [])}
                  />
                </Field>
                <Note of={catalog?.text} current={status.textModel} />
              </div>

              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void applyRecommended()}
                  disabled={busy !== null || !catalog}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[13.5px] text-slate-700 active:scale-[0.98] disabled:opacity-50"
                >
                  ★ 用推荐配置
                </button>
                <button
                  type="button"
                  onClick={() => provider && void reload(provider, true)}
                  disabled={busy !== null || catalogLoading || !provider}
                  className="shrink-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-500 active:scale-[0.98] disabled:opacity-50"
                >
                  重新获取
                </button>
              </div>

              {catalog?.message && (
                <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-800">
                  {catalog.message}
                </p>
              )}

              {catalogError && (
                <p className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] leading-relaxed text-rose-700">
                  {catalogError}
                </p>
              )}

              {catalog?.source === "remote" && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                  只列出适合解题的对话模型，同一型号的日期快照版（如 qwen-plus-2025-07-28）已折叠。
                </p>
              )}
            </>
          )}
        </section>

        {/* ---- 怎么拿到密钥 ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-[13px] font-medium text-slate-500">怎么拿到一把密钥</h2>
          <ol className="mt-3 space-y-3">
            <Step n={1}>
              打开
              <a
                href={info?.consoleUrl ?? "https://bailian.console.aliyun.com/"}
                target="_blank"
                rel="noreferrer"
                className="mx-1 text-brand-600 underline underline-offset-2"
              >
                {providerName}控制台
              </a>
              （没有账号就先注册一个）
            </Step>
            <Step n={2}>登录后，在左侧菜单找到「API-KEY」，点「创建我的 API-KEY」</Step>
            <Step n={3}>把生成的那串以 sk- 开头的字符整段复制，粘贴到下面的输入框</Step>
          </ol>
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
            密钥只显示一次，页面关掉就看不到了。没复制到就重新创建一个。
          </p>
        </section>

        {/* ---- 粘贴保存 ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label htmlFor="api-key" className="text-[13px] font-medium text-slate-500">
            {providerName} API Key
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="api-key"
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={info?.keyPlaceholder ?? "sk-xxxxxxxxxxxxxxxxxxxxxxxx"}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[13.5px] text-slate-800 outline-none focus:border-brand-300 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 rounded-xl border border-slate-200 px-3 text-[13px] text-slate-500 active:scale-[0.98]"
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
            {ready && status
              ? `已经存过一把了（${status.masked}）。这一栏留空就是继续用它，想换一把直接把新的粘进来覆盖。`
              : "粘贴时不用管首尾的空格，保存时会自动去掉。"}
          </p>

          <button
            type="button"
            onClick={() => void saveAndTest()}
            disabled={(!key.trim() && !ready) || busy !== null}
            className="mt-3.5 w-full rounded-xl bg-brand-600 py-3 text-[15px] font-medium text-white active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "save"
              ? "正在保存…"
              : busy === "test"
                ? "正在测试连接…"
                : key.trim()
                  ? "保存并测试连接"
                  : ready
                    ? "用已保存的密钥测试连接"
                    : "请先粘贴密钥"}
          </button>

          {error && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] leading-relaxed text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </p>
          )}

          {result && (
            <p
              className={`mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset ${
                result.ok
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200"
              }`}
            >
              {result.ok ? "✓ " : "⚠️ "}
              {result.message}
              {result.latencyMs !== undefined && result.ok && (
                <span className="text-emerald-600/70"> · {result.latencyMs} 毫秒</span>
              )}
            </p>
          )}
        </section>

        {/* ---- 服务地址 ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-[13px] font-medium text-slate-500">服务地址</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
            题目是被送到这个地址去识别的。在电脑上打开网页时不用管它；
            <span className="text-slate-700">装到手机上才需要填</span>
            ——填运行服务那台电脑的地址，手机和电脑连同一个 WiFi 就行。
          </p>

          <dl className="mt-3 space-y-1.5 text-[13px]">
            <Row label="当前" value={resolveApiUrl("/api")} />
            <Row label="默认" value={defaultBase() || "跟随当前网页地址"} />
          </dl>

          <div className="mt-3">
            <input
              value={baseDraft}
              onChange={(e) => {
                setBaseDraft(e.target.value);
                setBaseNote(null);
              }}
              placeholder="http://192.168.1.5:8787"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[13.5px] text-slate-800 outline-none focus:border-brand-300 focus:bg-white"
            />
          </div>

          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => void saveBase()}
              disabled={busy !== null}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-[13.5px] text-slate-700 active:scale-[0.98] disabled:opacity-50"
            >
              保存地址
            </button>
            <button
              type="button"
              onClick={resetBase}
              disabled={busy !== null}
              className="shrink-0 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13.5px] text-slate-500 active:scale-[0.98] disabled:opacity-50"
            >
              恢复默认
            </button>
          </div>

          {baseNote && (
            <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
              {baseNote}
            </p>
          )}

          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
            留空就是用当前网页地址，不用重启服务，下次请求立即生效。
            不知道电脑的地址，可以在电脑上开一个命令行窗口，输入 ipconfig，找 IPv4 那一行。
          </p>
        </section>

        {/* ---- 隐私 ---- */}
        <section className="rounded-2xl bg-slate-100/70 p-4">
          <h2 className="text-[13px] font-medium text-slate-500">关于安全</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
            密钥只保存在运行服务的这台电脑上（server/.env 文件），
            不会上传到别的地方，也不会出现在孩子看到的界面里。
            每家公司各存一把，来回切换不会互相覆盖；想换一把，直接粘新的保存即可。
          </p>
        </section>

        {/* ---- 常见问题 ---- */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-[13px] font-medium text-slate-500">测试没通过时</h2>
          <dl className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed">
            <Faq q="密钥不对">
              多半是复制时多选了空格，或者漏掉了几个字符。回控制台重新复制一次，
              注意开头的 sk- 别丢了。
            </Faq>
            <Faq q="没有权限">这个账号还没开通当前模型，去控制台按提示开通一下。</Faq>
            <Faq q="余额不足">账上没钱了，去控制台充值后再点一次测试。</Faq>
            <Faq q="模型不存在">
              当前模型这家公司没有（或者你的账号还开不了），在「模型」那一栏换一个试试。
            </Faq>
            <Faq q="额度用完">
              密钥本身是对的，是账号的用量到上限了。控制台里能看到剩余额度。
            </Faq>
            <Faq q="连不上模型服务">先确认这台电脑能正常上网，然后再点一次测试。</Faq>
            <Faq q="连不上服务地址">
              先看服务地址那一栏填得对不对（要在同一个 WiFi 下），
              再回到跑服务的那个窗口看看程序还在不在。
            </Faq>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ---------- 小组件 ----------

const SELECT_CLASS =
  "w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] text-slate-800 outline-none focus:border-brand-300 focus:bg-white disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-slate-500">{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint && (
        <span className="mt-1.5 block text-[12px] leading-relaxed text-slate-400">{hint}</span>
      )}
    </label>
  );
}

/** 下拉。推荐项前面加 ★ —— option 里加不了样式，只能靠字符 */
function Select({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: Array<{ value: string; label: string; recommended?: boolean }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // 当前值不在列表里（比如 .env 里手写了别的模型）时补一项，
  // 否则下拉会显示成空白，用户以为配置丢了
  const known = options.some((o) => o.value === value);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      {!known && <option value={value}>{value}（当前）</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.recommended ? "★ " : ""}
          {o.label}
        </option>
      ))}
    </select>
  );
}

function toOptions(list: ModelOption[]) {
  return list.map((m) => ({ value: m.id, label: m.label, recommended: m.recommended }));
}

/** 当前选中模型的说明（价格 / 定位）—— 选完才知道贵不贵就太晚了 */
function Note({ of, current }: { of?: ModelOption[]; current: string }) {
  const hit = of?.find((m) => m.id === current);
  if (!hit?.note) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
      {hit.recommended && <span className="text-brand-600">推荐 · </span>}
      {hit.note}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-10 shrink-0 text-slate-400">{label}</dt>
      <dd className="truncate font-mono text-[12.5px] text-slate-700">{value}</dd>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-medium text-brand-600">
        {n}
      </span>
      <span className="text-[13.5px] leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-slate-700">提示「{q}」</dt>
      <dd className="mt-0.5 text-slate-500">{children}</dd>
    </div>
  );
}
