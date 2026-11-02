import { useMemo, useState } from "react";

import { t } from "../lib/i18n";
import type { Ref } from "../lib/repo";
import type { BranchActions } from "../state/branch-actions";
import { useDialogs } from "../state/dialogs";
import { useRepo } from "../state/repo-context";
import {
  IconBranch,
  IconChevron,
  IconCompare,
  IconFetch,
  IconFolder,
  IconPlus,
  IconPull,
  IconSearch,
  IconStar,
  IconTag,
  IconTarget,
  IconTrash,
} from "./icons";

/** 树里被选中的项：某个引用，或 HEAD 本身 */
export type TreeSelection = { kind: "head" } | { kind: Ref["kind"]; name: string };

type Folder = { key: string; label: string; folders: Folder[]; refs: Ref[] };

function buildTree(key: string, refs: Ref[]): Folder {
  const root: Folder = { key, label: "", folders: [], refs: [] };
  for (const ref of refs) {
    const parts = ref.name.split("/");
    let at = root;
    for (const part of parts.slice(0, -1)) {
      let child = at.folders.find(f => f.label === part);
      if (!child) {
        child = { key: `${at.key}/${part}`, label: part, folders: [], refs: [] };
        at.folders.push(child);
      }
      at = child;
    }
    at.refs.push(ref);
  }
  const sort = (f: Folder) => {
    f.folders.sort((a, b) => a.label.localeCompare(b.label));
    f.refs.sort((a, b) => a.name.localeCompare(b.name));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const countRefs = (f: Folder): number => f.refs.length + f.folders.reduce((n, c) => n + countRefs(c), 0);

// 默认展开本地和各远端的第一层，标签折叠
const DEFAULT_OPEN: Record<string, boolean> = { local: true, remote: true, tags: false };

export function BranchTree({
  selection,
  onSelect,
  actions,
  onCompare,
}: {
  selection: TreeSelection;
  onSelect: (s: TreeSelection) => void;
  actions: BranchActions;
  onCompare: (ref: Ref) => void;
}) {
  const { refs, head, favorites, toggleFavorite, run, busy } = useRepo();
  const dialogs = useDialogs();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const q = filter.trim().toLowerCase();
  const match = (r: Ref) => !q || r.name.toLowerCase().includes(q);
  const isOpen = (key: string) => (q ? true : (open[key] ?? DEFAULT_OPEN[key] ?? key.split("/").length <= 2));
  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !isOpen(key) }));

  const local = useMemo(() => refs.filter(r => r.kind === "local"), [refs]);
  const remote = useMemo(() => refs.filter(r => r.kind === "remote"), [refs]);
  const tags = useMemo(() => refs.filter(r => r.kind === "tag").sort((a, b) => b.date - a.date), [refs]);

  const selectedRef =
    selection.kind === "head"
      ? local.find(r => r.name === head.branch)
      : refs.find(r => r.kind === selection.kind && r.name === selection.name);
  const isSelected = (r: Ref) => selection.kind === r.kind && "name" in selection && selection.name === r.name;

  const refRow = (r: Ref, depth: number, label = r.name.split("/").pop() ?? r.name) => {
    const isHead = r.kind === "local" && r.name === head.branch;
    const isFav = favorites.includes(r.name);
    return (
      <div
        key={`${r.kind}:${r.name}:${depth}:${label}`}
        className={`tree-row${isSelected(r) ? " selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        title={`${r.name}\n${r.subject}`}
        onClick={() => onSelect({ kind: r.kind, name: r.name })}
        onDoubleClick={() => !isHead && void actions.checkout(r)}
        onContextMenu={e => {
          onSelect({ kind: r.kind, name: r.name });
          dialogs.menu(e, actions.menuFor(r));
        }}
      >
        <span className="tree-twisty" />
        {isFav || isHead ? (
          <span className={`tree-icon ${isHead ? "head-star" : "fav-star"}`}>
            <IconStar filled />
          </span>
        ) : (
          <span className="tree-icon">{r.kind === "tag" ? <IconTag /> : <IconBranch />}</span>
        )}
        <span className={`tree-label${isHead ? " is-head" : ""}`}>{label}</span>
        {r.kind === "local" && (r.ahead > 0 || r.behind > 0 || r.isGone) && (
          <span
            className={`track${r.isGone ? " gone" : ""}`}
            title={
              r.isGone
                ? t("上游分支 {upstream} 已在远端删除", { upstream: r.upstream })
                : t("相对 {upstream}：领先 {ahead}、落后 {behind}。右键“更新”可快进到上游。", {
                    upstream: r.upstream,
                    ahead: r.ahead,
                    behind: r.behind,
                  })
            }
          >
            {r.isGone ? (
              t("上游已删")
            ) : (
              <>
                {r.ahead > 0 && <span className="ahead">↑{r.ahead}</span>}
                {r.behind > 0 && <span className="behind">↓{r.behind}</span>}
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  const folderRows = (f: Folder, depth: number): JSX.Element[] => {
    const rows: JSX.Element[] = [];
    for (const child of f.folders) {
      const o = isOpen(child.key);
      rows.push(
        <div
          key={`dir:${child.key}`}
          className="tree-row folder"
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => toggle(child.key)}
        >
          <span className="tree-twisty">
            <IconChevron open={o} />
          </span>
          <span className="tree-icon">
            <IconFolder />
          </span>
          <span className="tree-label">{child.label}</span>
          <span className="count">{countRefs(child)}</span>
        </div>,
      );
      if (o) rows.push(...folderRows(child, depth + 1));
    }
    for (const r of f.refs) rows.push(refRow(r, depth));
    return rows;
  };

  const section = (key: string, label: string, items: Ref[], body: () => JSX.Element[]) => {
    const o = isOpen(key);
    return (
      <>
        <div className="tree-row section" onClick={() => toggle(key)}>
          <span className="tree-twisty">
            <IconChevron open={o} />
          </span>
          <span className="tree-label">{label}</span>
          <span className="count">{items.length}</span>
        </div>
        {o && body()}
      </>
    );
  };

  const localShown = local.filter(match);
  const pinned = localShown.filter(r => favorites.includes(r.name) || r.name === head.branch);
  const canAct = Boolean(selectedRef) && !busy;
  const isSelectedHead = selectedRef?.kind === "local" && selectedRef.name === head.branch;

  return (
    <div className="branch-panel">
      <div className="side-toolbar">
        <button className="icon-btn" title={t("新建分支")} onClick={() => void actions.newBranch(selectedRef?.name ?? "HEAD")}>
          <IconPlus />
        </button>
        <button
          className="icon-btn"
          title={t("从所有远端获取最新提交")}
          disabled={Boolean(busy)}
          onClick={() => void run(t("获取"), ["fetch", "--all", "--prune"])}
        >
          <IconFetch />
        </button>
        <button
          className="icon-btn"
          title={
            selectedRef?.kind === "local" && selectedRef.upstream
              ? t("更新 {name}：获取并快进到 {upstream}", { name: selectedRef.name, upstream: selectedRef.upstream })
              : t("更新选中的本地分支")
          }
          disabled={!canAct || selectedRef?.kind !== "local" || !selectedRef.upstream}
          onClick={() => selectedRef && void actions.update(selectedRef)}
        >
          <IconPull />
        </button>
        <button
          className="icon-btn"
          title={t("删除分支")}
          disabled={!canAct || isSelectedHead}
          onClick={() => selectedRef && void actions.remove(selectedRef)}
        >
          <IconTrash />
        </button>
        <button
          className="icon-btn"
          title={t("与当前分支比较")}
          disabled={!canAct || isSelectedHead}
          onClick={() => selectedRef && onCompare(selectedRef)}
        >
          <IconCompare />
        </button>
        <span className="side-sep" />
        <button
          className="icon-btn"
          title={selectedRef && favorites.includes(selectedRef.name) ? t("取消收藏") : t("收藏")}
          disabled={!selectedRef || selectedRef.kind === "tag"}
          onClick={() => selectedRef && toggleFavorite(selectedRef.name)}
        >
          <IconStar filled={Boolean(selectedRef && favorites.includes(selectedRef.name))} />
        </button>
        <button className="icon-btn" title={t("定位到当前分支")} onClick={() => onSelect({ kind: "head" })}>
          <IconTarget />
        </button>
      </div>
      <div className="tree">
        <label className="tree-search">
          <IconSearch />
          <input value={filter} placeholder={t("搜索分支或标签")} onChange={e => setFilter(e.target.value)} spellCheck={false} />
        </label>
        <div className="tree-body">
          <div
            className={`tree-row${selection.kind === "head" ? " selected" : ""}`}
            onClick={() => onSelect({ kind: "head" })}
            onContextMenu={e => {
              const h = local.find(r => r.name === head.branch);
              if (h) dialogs.menu(e, actions.menuFor(h));
            }}
          >
            <span className="tree-twisty" />
            <span className="tree-label">
              HEAD{" "}
              <span className="muted">
                {head.branch
                  ? t("（当前分支 {name}）", { name: head.branch })
                  : t("（游离于 {sha}）", { sha: head.sha.slice(0, 8) })}
              </span>
            </span>
          </div>
          {section("local", t("本地"), localShown, () => [
            ...pinned.map(r => refRow(r, 1, r.name)),
            ...folderRows(
              buildTree(
                "local",
                localShown.filter(r => !pinned.includes(r)),
              ),
              1,
            ),
          ])}
          {section("remote", t("远端"), remote.filter(match), () => folderRows(buildTree("remote", remote.filter(match)), 1))}
          {section("tags", t("标签"), tags.filter(match), () => tags.filter(match).slice(0, 500).map(r => refRow(r, 1, r.name)))}
        </div>
      </div>
    </div>
  );
}
