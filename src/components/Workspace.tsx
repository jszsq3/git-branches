import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";

import { t } from "../lib/i18n";
import { loadCommitDiff, loadRangeDiff } from "../lib/repo";
import type { CommitInfo, FileChange, Ref } from "../lib/repo";
import { useBranchActions } from "../state/branch-actions";
import { useDialogs } from "../state/dialogs";
import type { MenuItem } from "../state/dialogs";
import { useRepo } from "../state/repo-context";
import { BranchTree } from "./BranchTree";
import type { TreeSelection } from "./BranchTree";
import { ChangesView } from "./ChangesView";
import { CommitDetails } from "./CommitDetails";
import { DiffView } from "./DiffView";
import { IconBranch, IconFetch, IconPull, IconPush, IconRefresh } from "./icons";
import { LogView } from "./LogView";
import type { LogScope } from "./LogView";
import { Splitter, useSize } from "./Splitter";

type Compare = { ref: Ref; direction: "incoming" | "outgoing" };
type OpenDiff = { file: FileChange; source: { commit: CommitInfo } | { from: string; to: string } };

/** 日志范围：null 表示全部分支 */
type Scope = { revs: string[]; name: string } | null;

export function Workspace({ recent, onOpenRepo, onPickFolder }: { recent: string[]; onOpenRepo: (root: string) => void; onPickFolder: () => void }) {
  const repo = useRepo();
  const { root, head, refs, status, busy, run, reload } = repo;
  const dialogs = useDialogs();
  const [tab, setTab] = useState<"log" | "changes">("log");
  const [selection, setSelection] = useState<TreeSelection>({ kind: "head" });
  const [scope, setScope] = useState<Scope>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [openDiff, setOpenDiff] = useState<OpenDiff | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffError, setDiffError] = useState("");

  const [treeW, setTreeW] = useSize("tree", 280, 200, 520);
  const [detailsW, setDetailsW] = useSize("details", 380, 260, 700);
  const [diffH, setDiffH] = useSize("diff", 340, 140, 900);

  const startCompare = useCallback((ref: Ref) => {
    setTab("log");
    setCompare({ ref, direction: "incoming" });
    setSha(null);
    setRange(null);
    setOpenDiff(null);
  }, []);
  const actions = useBranchActions(startCompare);

  // 换仓库时复位视图
  useEffect(() => {
    setSelection({ kind: "head" });
    setScope(null);
    setCompare(null);
    setSha(null);
    setRange(null);
    setOpenDiff(null);
  }, [root]);

  const selectTree = (s: TreeSelection) => {
    setSelection(s);
    setCompare(null);
    setRange(null);
    setTab("log");
    if (s.kind === "head") setScope({ revs: ["HEAD"], name: head.branch || "HEAD" });
    else {
      const full = s.kind === "local" ? `refs/heads/${s.name}` : s.kind === "remote" ? `refs/remotes/${s.name}` : `refs/tags/${s.name}`;
      setScope({ revs: [full], name: s.name });
    }
  };

  const current = head.branch || "HEAD";
  const logScope: LogScope = compare
    ? compare.direction === "incoming"
      ? { revs: [`HEAD..${compare.ref.name}`], label: t("{name} 独有", { name: compare.ref.name }) }
      : { revs: [`${compare.ref.name}..HEAD`], label: t("{name} 独有", { name: current }) }
    : scope
      ? { revs: scope.revs, label: scope.name }
      : { revs: [], label: t("全部") };

  useEffect(() => {
    if (!openDiff) return;
    let alive = true;
    setDiffText(null);
    setDiffError("");
    const p =
      "commit" in openDiff.source
        ? loadCommitDiff(root, openDiff.source.commit, openDiff.file)
        : loadRangeDiff(root, openDiff.source.from, openDiff.source.to, openDiff.file);
    p.then(text => alive && setDiffText(text)).catch(e => alive && setDiffError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [root, openDiff]);

  const headRef = refs.find(r => r.kind === "local" && r.name === head.branch);
  const changeCount = status.staged.length + status.unstaged.length + status.conflicts.length;

  const branchMenu = (e: React.MouseEvent) => {
    const recentLocal = refs
      .filter(r => r.kind === "local" && r.name !== head.branch)
      .sort((a, b) => b.date - a.date)
      .slice(0, 12);
    const items: MenuItem[] = [
      { label: t("新建分支…"), onSelect: () => void actions.newBranch("HEAD") },
      "separator",
      ...recentLocal.map(r => ({ label: t("检出 {name}", { name: r.name }), onSelect: () => void actions.checkout(r) })),
    ];
    dialogs.menu(e, items);
  };

  const repoMenu = (e: React.MouseEvent) => {
    const items: MenuItem[] = [
      { label: t("打开文件夹…"), onSelect: onPickFolder },
      { label: t("在 Finder 中显示"), onSelect: () => void revealItemInDir(root) },
    ];
    const others = recent.filter(r => r !== root);
    if (others.length) items.push("separator", ...others.map(r => ({ label: r, onSelect: () => onOpenRepo(r) })));
    dialogs.menu(e, items);
  };

  const stateLabel = head.state === "rebasing" ? t("变基中") : head.state === "merging" ? t("合并中") : t("进行中");

  return (
    <div className="app">
      <header className="topbar">
        <button className="repo-btn" onClick={repoMenu} title={root}>
          <span className="repo-name">{root.split("/").pop()}</span>
          <span className="caret">▾</span>
        </button>
        <button className="branch-btn" onClick={branchMenu} title={t("切换或新建分支")}>
          <IconBranch />
          <span>{head.branch || t("游离 {sha}", { sha: head.sha.slice(0, 8) })}</span>
          {headRef && (headRef.ahead > 0 || headRef.behind > 0) && (
            <span className="track">
              {headRef.ahead ? `↑${headRef.ahead}` : ""}
              {headRef.behind ? ` ↓${headRef.behind}` : ""}
            </span>
          )}
          <span className="caret">▾</span>
        </button>
        <span className="spacer" />
        {busy && <span className="busy">{busy}…</span>}
        <button
          className="tool"
          disabled={Boolean(busy)}
          onClick={() => void run(t("获取"), ["fetch", "--all", "--prune"])}
          title={t("从所有远端获取最新提交，只更新远端分支，不改动本地分支")}
        >
          <IconFetch /> {t("获取")}
        </button>
        <button
          className="tool"
          disabled={Boolean(busy) || !headRef?.upstream}
          onClick={() => void actions.pull()}
          title={t("把当前分支更新到上游的最新提交")}
        >
          <IconPull /> {t("拉取")}
        </button>
        <button className="tool" disabled={Boolean(busy) || !headRef} onClick={() => headRef && void actions.push(headRef)} title={t("推送当前分支")}>
          <IconPush /> {t("推送")}
        </button>
        <button className="tool" onClick={() => void reload()} title={t("刷新")}>
          <IconRefresh />
        </button>
      </header>

      <div className="main">
        <div style={{ width: treeW }} className="pane">
          <BranchTree selection={selection} onSelect={selectTree} actions={actions} onCompare={startCompare} />
        </div>
        <Splitter axis="x" size={treeW} onSize={setTreeW} />
        <div className="content">
          <nav className="tabs">
            <button className={`tab${tab === "log" ? " active" : ""}`} onClick={() => setTab("log")}>
              {t("日志")}
            </button>
            <button className={`tab${tab === "changes" ? " active" : ""}`} onClick={() => setTab("changes")}>
              {t("提交")}
              {changeCount > 0 && <span className="tab-count">{changeCount}</span>}
            </button>
            {head.state && <span className="state-pill">{stateLabel}</span>}
          </nav>
          {tab === "changes" ? (
            <ChangesView />
          ) : (
            <div className="log-area">
              <div className="log-top">
                <div className="log-main">
                  <LogView
                    scope={logScope}
                    selected={sha}
                    onSelect={c => {
                      setSha(c.sha);
                      setRange(null);
                      setOpenDiff(null);
                    }}
                    onClearScope={() => {
                      setCompare(null);
                      setScope(null);
                    }}
                    banner={
                      compare && (
                        <div className="compare-bar">
                          <span>{t("比较 {name} 与 {current}：", { name: compare.ref.name, current })}</span>
                          <button
                            className={`seg${compare.direction === "incoming" ? " on" : ""}`}
                            onClick={() => setCompare({ ...compare, direction: "incoming" })}
                          >
                            {t("{name} 有、当前没有", { name: compare.ref.name })}
                          </button>
                          <button
                            className={`seg${compare.direction === "outgoing" ? " on" : ""}`}
                            onClick={() => setCompare({ ...compare, direction: "outgoing" })}
                          >
                            {t("当前有、{name} 没有", { name: compare.ref.name })}
                          </button>
                          <button
                            className="link"
                            onClick={() => {
                              setSha(null);
                              setOpenDiff(null);
                              setRange(
                                compare.direction === "incoming"
                                  ? { from: "HEAD", to: compare.ref.name }
                                  : { from: compare.ref.name, to: "HEAD" },
                              );
                            }}
                          >
                            {t("看改动文件")}
                          </button>
                          <span className="spacer" />
                          <button className="link" onClick={() => setCompare(null)}>
                            {t("结束比较")}
                          </button>
                        </div>
                      )
                    }
                  />
                </div>
                <Splitter axis="x" size={detailsW} onSize={setDetailsW} invert />
                <div style={{ width: detailsW }} className="pane">
                  <CommitDetails
                    sha={sha}
                    range={range}
                    selectedFile={openDiff?.file ?? null}
                    onSelectSha={s => {
                      setSha(s);
                      setOpenDiff(null);
                    }}
                    onSelectFile={(file, commit) =>
                      setOpenDiff({ file, source: commit ? { commit } : range ? range : { from: "HEAD", to: "HEAD" } })
                    }
                  />
                </div>
              </div>
              {openDiff && (
                <>
                  <Splitter axis="y" size={diffH} onSize={setDiffH} invert />
                  <div style={{ height: diffH }} className="diff-dock">
                    <DiffView root={root} file={openDiff.file} text={diffText} error={diffError} onClose={() => setOpenDiff(null)} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
