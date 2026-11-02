import { useMemo } from "react";

import { parseDiff } from "../lib/diff";
import { statusLabel } from "../lib/format";
import { t, useLocale } from "../lib/i18n";
import type { FileChange } from "../lib/repo";
import { openInApp } from "./FileList";
import { IconOpen } from "./icons";

const MAX_LINES = 20_000;

export function DiffView({
  root,
  file,
  text,
  error,
  onClose,
  title,
}: {
  root: string;
  file: FileChange;
  text: string | null;
  error?: string;
  onClose?: () => void;
  title?: string;
}) {
  const locale = useLocale();
  // 解析结果里带有提示文案，切换语言时重新解析
  const lines = useMemo(() => (text === null ? [] : parseDiff(text)), [text, locale]);
  const shown = lines.slice(0, MAX_LINES);
  const added = lines.filter(l => l.kind === "add").length;
  const removed = lines.filter(l => l.kind === "del").length;
  return (
    <div className="diff">
      <div className="diff-header">
        <span className={`status-dot s-${file.status === "?" ? "N" : file.status}`}>{file.status}</span>
        <span className="diff-path" title={file.path}>
          {file.oldPath ? `${file.oldPath} → ` : ""}
          {file.path}
        </span>
        <span className="muted">{title ?? statusLabel(file.status)}</span>
        <span className="diff-stat">
          <span className="add">+{added}</span> <span className="del">−{removed}</span>
        </span>
        <span className="spacer" />
        {file.status !== "D" && (
          <button className="btn small" onClick={() => void openInApp(root, file.path)}>
            <IconOpen /> {t("打开文件")}
          </button>
        )}
        {onClose && (
          <button className="btn small" onClick={onClose} title={t("关闭差异")}>
            {t("关闭")}
          </button>
        )}
      </div>
      <div className="diff-body">
        {error && <div className="empty error">{error}</div>}
        {text === null && !error && <div className="empty">{t("加载中…")}</div>}
        {text !== null && lines.length === 0 && <div className="empty">{t("没有内容差异（可能只改了权限或是空文件）")}</div>}
        <table className="diff-table">
          <tbody>
            {shown.map((l, i) =>
              l.kind === "hunk" ? (
                <tr key={i} className="d-hunk">
                  <td className="ln" />
                  <td className="ln" />
                  <td className="code">{l.text}</td>
                </tr>
              ) : l.kind === "meta" ? (
                <tr key={i} className="d-meta">
                  <td className="ln" />
                  <td className="ln" />
                  <td className="code">{l.text}</td>
                </tr>
              ) : (
                <tr key={i} className={`d-${l.kind}`}>
                  <td className="ln">{l.old ?? ""}</td>
                  <td className="ln">{l.new ?? ""}</td>
                  <td className="code">
                    <span className="sign">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                    {l.text}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {lines.length > MAX_LINES && <div className="empty">{t("差异过长，只显示前 {n} 行", { n: MAX_LINES })}</div>}
      </div>
    </div>
  );
}
