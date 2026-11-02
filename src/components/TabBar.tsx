import { useState } from "react";

import { LOCALES, setLocale, t, useLocale } from "../lib/i18n";
import type { RepoSummary } from "../state/repo-context";
import { useDialogs } from "../state/dialogs";
import { IconPlus } from "./icons";

/** 同名仓库在标签上补上父目录，便于区分 */
export function tabLabels(tabs: string[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const root of tabs) {
    const parts = root.split("/").filter(Boolean);
    const name = parts[parts.length - 1] ?? root;
    const clash = tabs.some(other => other !== root && other.split("/").filter(Boolean).pop() === name);
    labels[root] = clash ? `${parts[parts.length - 2] ?? ""}/${name}` : name;
  }
  return labels;
}

export function TabBar({
  tabs,
  active,
  summaries,
  onActivate,
  onClose,
  onCloseOthers,
  onMove,
  onAdd,
}: {
  tabs: string[];
  active: string | null;
  summaries: Record<string, RepoSummary | undefined>;
  onActivate: (root: string) => void;
  onClose: (root: string) => void;
  onCloseOthers: (root: string) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const dialogs = useDialogs();
  const locale = useLocale();
  const [dragging, setDragging] = useState<number | null>(null);
  const labels = tabLabels(tabs);

  return (
    <div className="tabbar" data-tauri-drag-region>
      <div className="tab-strip" data-tauri-drag-region>
        {tabs.map((root, i) => {
          const s = summaries[root];
          return (
            <div
              key={root}
              className={`ws-tab${root === active ? " active" : ""}${dragging === i ? " dragging" : ""}`}
              title={root}
              draggable
              onDragStart={e => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={e => {
                e.preventDefault();
                if (dragging !== null && dragging !== i) {
                  onMove(dragging, i);
                  setDragging(i);
                }
              }}
              onDragEnd={() => setDragging(null)}
              onMouseDown={e => e.button === 1 && (e.preventDefault(), onClose(root))}
              onClick={() => onActivate(root)}
              onContextMenu={e =>
                dialogs.menu(e, [
                  { label: t("关闭"), onSelect: () => onClose(root) },
                  { label: t("关闭其他工作区"), onSelect: () => onCloseOthers(root), isDisabled: tabs.length < 2 },
                  "separator",
                  { label: t("复制路径"), onSelect: () => void navigator.clipboard.writeText(root) },
                ])
              }
            >
              {i < 9 && <span className="ws-key">⌘{i + 1}</span>}
              <span className="ws-name">{labels[root]}</span>
              {s?.branch && <span className="ws-branch">{s.branch}</span>}
              {s?.hasState && <span className="ws-dot warn" title={t("合并或变基进行中")} />}
              {s && s.changes > 0 && (
                <span className="ws-changes" title={t("{n} 个文件有改动", { n: s.changes })}>
                  {s.changes}
                </span>
              )}
              {s?.isBusy && <span className="ws-spin" title={t("正在执行")} />}
              <button
                className="ws-close"
                title={t("关闭工作区 (⌘W)")}
                onClick={e => {
                  e.stopPropagation();
                  onClose(root);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="ws-add" title={t("打开文件夹 (⌘O)")} onClick={onAdd}>
          <IconPlus />
        </button>
      </div>
      <span className="ws-count" data-tauri-drag-region>
        {t("{n} 个工作区", { n: tabs.length })}
      </span>
      <div className="lang-switch" role="group" aria-label={t("界面语言")}>
        {LOCALES.map(l => (
          <button key={l.value} className={`lang-btn${locale === l.value ? " on" : ""}`} onClick={() => setLocale(l.value)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
