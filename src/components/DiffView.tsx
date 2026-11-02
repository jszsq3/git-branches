import { useMemo } from "react";

import { parseDiff } from "../lib/diff";
import { STATUS_LABEL } from "../lib/format";
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
  const lines = useMemo(() => (text === null ? [] : parseDiff(text)), [text]);
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
        <span className="muted">{title ?? STATUS_LABEL[file.status]}</span>
        <span className="diff-stat">
          <span className="add">+{added}</span> <span className="del">−{removed}</span>
        </span>
        <span className="spacer" />
        {file.status !== "D" && (
          <button className="btn small" onClick={() => void openInApp(root, file.path)}>
            <IconOpen /> 打开文件
          </button>
        )}
        {onClose && (
          <button className="btn small" onClick={onClose} title="关闭差异">
            关闭
          </button>
        )}
      </div>
      <div className="diff-body">
        {error && <div className="empty error">{error}</div>}
        {text === null && !error && <div className="empty">加载中…</div>}
        {text !== null && lines.length === 0 && <div className="empty">没有内容差异（可能只改了权限或是空文件）</div>}
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
        {lines.length > MAX_LINES && <div className="empty">差异过长，只显示前 {MAX_LINES} 行</div>}
      </div>
    </div>
  );
}
