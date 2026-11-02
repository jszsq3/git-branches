import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";

import appIcon from "../../src-tauri/icons/icon.svg";
import { t } from "../lib/i18n";
import { checkForUpdate, downloadUpdate, formatSize, skippedVersion, skipVersion } from "../lib/update";
import type { UpdateCheck } from "../lib/update";
import { useDialogs } from "../state/dialogs";

const FIRST_CHECK_DELAY = 3_000;
const CHECK_INTERVAL = 6 * 3_600_000;

type Phase = { kind: "idle" } | { kind: "downloading" } | { kind: "downloaded"; path: string };

/**
 * 启动后与每隔几小时静默检查一次，发现没被跳过的新版本时弹窗提示；
 * 菜单“检查更新…”或点版本号时主动检查，并告知结果。
 */
export function useUpdater() {
  const dialogs = useDialogs();
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [version, setVersion] = useState("");
  const checking = useRef(false);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const run = useCallback(
    async (isManual: boolean) => {
      if (checking.current) return;
      checking.current = true;
      setIsChecking(isManual);
      let result: UpdateCheck | null = null;
      let failure = "";
      try {
        result = await checkForUpdate();
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      } finally {
        // 先复位，再弹结果：弹窗开着时版本号不该还显示“检查中”
        checking.current = false;
        setIsChecking(false);
      }
      if (!result) {
        // 静默检查失败不打扰，下次再试
        if (isManual) await dialogs.alert(t("检查更新失败"), failure);
        return;
      }
      setCheck(result);
      if (result.isNewer && (isManual || result.latest?.version !== skippedVersion())) {
        setIsOpen(true);
      } else if (isManual) {
        await dialogs.alert(t("已是最新版本"), t("当前版本 {version} 已是最新。", { version: result.current }));
      }
    },
    [dialogs],
  );

  useEffect(() => {
    const first = setTimeout(() => void run(false), FIRST_CHECK_DELAY);
    const timer = setInterval(() => void run(false), CHECK_INTERVAL);
    const unlisten = listen("check-update", () => void run(true));
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      void unlisten.then(fn => fn());
    };
  }, [run]);

  const download = async () => {
    const release = check?.latest;
    if (!release) return;
    setPhase({ kind: "downloading" });
    try {
      const path = await downloadUpdate(release);
      setPhase({ kind: "downloaded", path });
      await openPath(path);
    } catch (error) {
      setPhase({ kind: "idle" });
      await dialogs.alert(t("下载失败"), error instanceof Error ? error.message : String(error));
    }
  };

  const dialog =
    isOpen && check?.latest ? (
      <UpdateDialog
        check={check}
        phase={phase}
        onDownload={() => void download()}
        onSkip={() => {
          if (check.latest) skipVersion(check.latest.version);
          setIsOpen(false);
        }}
        onClose={() => setIsOpen(false)}
      />
    ) : null;

  // 有没被跳过的新版本时，版本号上挂一个提示点
  const pendingVersion = check?.isNewer && check.latest && check.latest.version !== skippedVersion() ? check.latest.version : null;

  return {
    dialog,
    isChecking,
    version,
    pendingVersion,
    checkNow: () => (check?.isNewer && check.latest ? setIsOpen(true) : void run(true)),
  };
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function UpdateDialog({
  check,
  phase,
  onDownload,
  onSkip,
  onClose,
}: {
  check: UpdateCheck;
  phase: Phase;
  onDownload: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const release = check.latest!;
  const isBusy = phase.kind === "downloading";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !isBusy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBusy, onClose]);

  const day = formatDay(release.published_at);

  return (
    <div className="modal-backdrop">
      <div className="modal update-modal" role="dialog" aria-label={t("发现新版本")}>
        <div className="update-head">
          <img src={appIcon} width={60} height={60} alt="" className="update-icon" />
          <div>
            <h2 className="update-heading">
              {phase.kind === "downloaded" ? t("新版本已下载") : t("GitBranches {version} 已发布", { version: release.version })}
            </h2>
            <p className="update-sub">
              {t("你正在使用 {current}", { current: check.current })}
              {day ? ` · ${t("{day} 发布", { day })}` : ""} · {formatSize(release.size)}
            </p>
          </div>
        </div>

        {phase.kind === "downloaded" ? (
          <ol className="update-steps">
            <li>{t("退出 GitBranches（⌘Q）。")}</li>
            <li>{t("在已打开的安装窗口里，把 GitBranches 拖到“应用程序”，选择替换。")}</li>
            <li>{t("重新打开 GitBranches。")}</li>
          </ol>
        ) : (
          <div className="update-notes-box">
            <div className="update-notes-title">{t("更新内容")}</div>
            {release.notes ? (
              <pre className="update-notes-body">{release.notes}</pre>
            ) : (
              <p className="update-notes-empty">{t("这个版本没有填写更新说明。")}</p>
            )}
          </div>
        )}

        <div className="update-footer">
          {phase.kind === "downloaded" ? (
            <>
              <button className="btn" onClick={() => void revealItemInDir(phase.path)}>
                {t("在 Finder 中显示")}
              </button>
              <button className="btn" onClick={() => void openPath(phase.path)}>
                {t("再次打开安装包")}
              </button>
              <span className="spacer" />
              <button className="btn primary" autoFocus onClick={() => void getCurrentWindow().close()}>
                {t("退出应用")}
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={onSkip} disabled={isBusy}>
                {t("跳过此版本")}
              </button>
              <span className="spacer" />
              <button className="btn" onClick={onClose} disabled={isBusy}>
                {t("稍后")}
              </button>
              <button className="btn primary" autoFocus onClick={onDownload} disabled={isBusy}>
                {isBusy ? t("下载中…") : t("下载并安装")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
