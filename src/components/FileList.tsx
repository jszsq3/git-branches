import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";

import { t } from "../lib/i18n";
import type { FileChange } from "../lib/repo";
import type { MenuItem } from "../state/dialogs";
import { useDialogs } from "../state/dialogs";

export async function openInApp(root: string, path: string) {
  await openPath(`${root}/${path}`);
}

export function fileMenu(root: string, file: FileChange, extra: MenuItem[] = []): MenuItem[] {
  const items: MenuItem[] = [];
  if (file.status !== "D") {
    items.push({ label: t("打开文件"), onSelect: () => void openInApp(root, file.path) });
    items.push({ label: t("在 Finder 中显示"), onSelect: () => void revealItemInDir(`${root}/${file.path}`) });
  }
  items.push({ label: t("复制路径"), onSelect: () => void navigator.clipboard.writeText(file.path) });
  if (extra.length) items.push("separator", ...extra);
  return items;
}

/** 一行一个文件：状态、文件名、所在目录；右侧可放操作按钮。 */
export function FileRow({
  root,
  file,
  isSelected,
  onSelect,
  menuExtra,
  trailing,
}: {
  root: string;
  file: FileChange;
  isSelected: boolean;
  onSelect: () => void;
  menuExtra?: MenuItem[];
  trailing?: ReactNode;
}) {
  const dialogs = useDialogs();
  const slash = file.path.lastIndexOf("/");
  const name = file.path.slice(slash + 1);
  const dir = slash === -1 ? "" : file.path.slice(0, slash);
  return (
    <div
      className={`file-row${isSelected ? " selected" : ""}`}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      onClick={onSelect}
      onDoubleClick={() => file.status !== "D" && void openInApp(root, file.path)}
      onContextMenu={e => {
        onSelect();
        dialogs.menu(e, fileMenu(root, file, menuExtra));
      }}
    >
      <span className={`status-dot s-${file.status === "?" ? "N" : file.status}`}>{file.status}</span>
      <span className={`file-name s-${file.status === "?" ? "N" : file.status}`}>{name}</span>
      <span className="file-dir">{dir}</span>
      {trailing && <span className="file-actions">{trailing}</span>}
    </div>
  );
}
