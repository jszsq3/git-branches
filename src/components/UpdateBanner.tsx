import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "../lib/i18n";
import { checkForUpdate, downloadUpdate, formatSize, skippedVersion, skipVersion } from "../lib/update";
import type { UpdateCheck } from "../lib/update";
import { useDialogs } from "../state/dialogs";

const FIRST_CHECK_DELAY = 3_000;
const CHECK_INTERVAL = 6 * 3_600_000;

type Phase = { kind: "idle" } | { kind: "downloading" } | { kind: "downloaded"; path: string };

/**
 * 启动后与每隔几小时静默检查一次，有新版本时在顶部提示；
 * 菜单“检查更新…”或点版本号时主动检查，并告知结果。
 */
export function useUpdater() {
  const dialogs = useDialogs();
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [isVisible, setIsVisible] = useState(false);
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
        setIsVisible(true);
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

  const banner =
    isVisible && check?.latest ? (
      <UpdateBanner
        check={check}
        phase={phase}
        onDownload={async () => {
          const release = check.latest;
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
        }}
        onSkip={() => {
          if (check.latest) skipVersion(check.latest.version);
          setIsVisible(false);
        }}
        onClose={() => setIsVisible(false)}
      />
    ) : null;

  return { banner, isChecking, version, checkNow: () => void run(true) };
}

function UpdateBanner({
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
  return (
    <div className="update-bar" role="status">
      <div className="update-text">
        {phase.kind === "downloaded" ? (
          <span>{t("新版本已下载并打开，把 GitBranches 拖到“应用程序”替换旧版本，然后重新打开应用。")}</span>
        ) : (
          <>
            <span className="update-title">
              {t("发现新版本 {latest}（当前 {current}）", { latest: release.version, current: check.current })}
            </span>
            {release.notes && (
              <span className="update-notes" title={release.notes}>
                {release.notes}
              </span>
            )}
          </>
        )}
      </div>
      <div className="update-actions">
        {phase.kind === "downloaded" ? (
          <>
            <button className="btn small" onClick={() => void revealItemInDir(phase.path)}>
              {t("在 Finder 中显示")}
            </button>
            <button className="btn small" onClick={() => void openPath(phase.path)}>
              {t("再次打开安装包")}
            </button>
          </>
        ) : (
          <>
            <button className="btn small" onClick={onSkip} disabled={phase.kind === "downloading"}>
              {t("跳过此版本")}
            </button>
            <button className="btn small primary" onClick={onDownload} disabled={phase.kind === "downloading"}>
              {phase.kind === "downloading" ? t("下载中…") : t("下载更新（{size}）", { size: formatSize(release.size) })}
            </button>
          </>
        )}
        <button className="ws-close update-close" title={t("关闭")} onClick={onClose}>
          ×
        </button>
      </div>
    </div>
  );
}
