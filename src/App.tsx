import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";

import { git } from "./lib/git";
import { syncMenuLocale, t, useLocale } from "./lib/i18n";
import { findRoot } from "./lib/repo";
import { forgetRepo, openTabs, recentRepos, rememberRepo, saveOpenTabs } from "./lib/storage";
import { DialogsProvider, useDialogs } from "./state/dialogs";
import { RepoProvider } from "./state/repo-context";
import type { RepoSummary } from "./state/repo-context";
import { IconFolder } from "./components/icons";
import { TabBar, tabLabels } from "./components/TabBar";
import { useUpdater } from "./components/UpdateBanner";
import { Workspace } from "./components/Workspace";
import "./styles.css";

export default function App() {
  return (
    <DialogsProvider>
      <Shell />
    </DialogsProvider>
  );
}

function Shell() {
  const dialogs = useDialogs();
  // 订阅语言：切换时整棵界面重绘
  const locale = useLocale();
  const updater = useUpdater();
  const [recent, setRecent] = useState<string[]>(recentRepos);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, RepoSummary | undefined>>({});
  const [isRestored, setIsRestored] = useState(false);

  const openRepo = useCallback(
    async (folder: string) => {
      let found = await findRoot(folder).catch(() => null);
      if (!found) {
        const ok = await dialogs.confirm({
          title: t("不是 Git 仓库"),
          message: t("{folder} 不在任何 Git 仓库中。要在这里初始化一个新仓库吗？", { folder }),
          confirmLabel: t("初始化仓库"),
        });
        if (!ok) {
          forgetRepo(folder);
          setRecent(recentRepos());
          return;
        }
        try {
          await git(folder, ["init"]);
          found = folder;
        } catch (e) {
          await dialogs.alert(t("初始化失败"), e instanceof Error ? e.message : String(e));
          return;
        }
      }
      const root = found;
      rememberRepo(root);
      setRecent(recentRepos());
      setTabs(t => (t.includes(root) ? t : [...t, root]));
      setActive(root);
    },
    [dialogs],
  );

  const pickFolder = useCallback(async () => {
    const picked = await open({ directory: true, multiple: false, title: t("选择包含 Git 仓库的文件夹") });
    if (typeof picked === "string") await openRepo(picked);
  }, [openRepo]);

  const closeTab = useCallback((root: string) => {
    setTabs(t => {
      const i = t.indexOf(root);
      const next = t.filter(r => r !== root);
      setActive(a => (a === root ? (next[i] ?? next[i - 1] ?? null) : a));
      return next;
    });
    setSummaries(s => ({ ...s, [root]: undefined }));
  }, []);

  const moveTab = useCallback((from: number, to: number) => {
    setTabs(t => {
      const next = [...t];
      const [item] = next.splice(from, 1);
      if (item !== undefined) next.splice(to, 0, item);
      return next;
    });
  }, []);

  const onSummary = useCallback((root: string, s: RepoSummary) => {
    setSummaries(m => {
      const old = m[root];
      if (old && old.branch === s.branch && old.changes === s.changes && old.isBusy === s.isBusy && old.hasState === s.hasState) {
        return m;
      }
      return { ...m, [root]: s };
    });
  }, []);

  // 启动时恢复上次打开的标签，丢掉已不存在的仓库
  useEffect(() => {
    const stored = openTabs();
    // 还没有保存过标签时（如刚从单仓库版本升级），打开最近一个仓库
    const last = recentRepos()[0];
    const saved = stored.tabs.length || !last ? stored : { tabs: [last], active: last };
    void Promise.all(saved.tabs.map(r => findRoot(r).catch(() => null))).then(found => {
      const valid = saved.tabs.filter((r, i) => found[i] === r);
      setTabs(valid);
      setActive(valid.includes(saved.active ?? "") ? saved.active : (valid[0] ?? null));
      setIsRestored(true);
    });
  }, []);

  useEffect(() => {
    if (isRestored) saveOpenTabs({ tabs, active });
  }, [tabs, active, isRestored]);

  useEffect(() => {
    document.title = active ? `${tabLabels(tabs)[active]} — ${t("Git 分支")}` : t("Git 分支");
  }, [active, tabs, locale]);

  // 把保存的语言同步给原生菜单
  useEffect(() => {
    syncMenuLocale();
  }, []);

  // ⌘1…⌘9 切换，⌘W 关闭当前，⌘O 打开文件夹，⌃Tab / ⌃⇧Tab 前后切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Tab" && tabs.length > 1) {
        e.preventDefault();
        const i = tabs.indexOf(active ?? "");
        const next = tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length];
        if (next) setActive(next);
        return;
      }
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      if (/^[1-9]$/.test(e.key)) {
        const target = e.key === "9" ? tabs[tabs.length - 1] : tabs[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          setActive(target);
        }
      } else if (e.key.toLowerCase() === "w" && active) {
        e.preventDefault();
        closeTab(active);
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickFolder();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, active, closeTab, pickFolder]);

  return (
    <div className="shell">
      <TabBar
        tabs={tabs}
        active={active}
        summaries={summaries}
        onActivate={setActive}
        onClose={closeTab}
        onCloseOthers={root => {
          tabs.filter(r => r !== root).forEach(closeTab);
          setActive(root);
        }}
        onMove={moveTab}
        onAdd={() => void pickFolder()}
        version={updater.version}
        isCheckingUpdate={updater.isChecking}
        onCheckUpdate={updater.checkNow}
      />
      {updater.banner}
      <div className="shell-body">
        {isRestored && tabs.length === 0 && (
          <Welcome
            recent={recent}
            onPick={() => void pickFolder()}
            onOpen={r => void openRepo(r)}
            onForget={r => {
              forgetRepo(r);
              setRecent(recentRepos());
            }}
          />
        )}
        {tabs.map(root => (
          // 未激活的标签保持挂载，切回来时选中项、筛选和滚动位置都还在
          <div key={root} className="ws-pane" style={{ display: root === active ? "flex" : "none" }}>
            <RepoProvider root={root} isActive={root === active} onSummary={onSummary}>
              <Workspace recent={recent} onOpenRepo={r => void openRepo(r)} onPickFolder={() => void pickFolder()} />
            </RepoProvider>
          </div>
        ))}
      </div>
    </div>
  );
}

function Welcome({
  recent,
  onPick,
  onOpen,
  onForget,
}: {
  recent: string[];
  onPick: () => void;
  onOpen: (root: string) => void;
  onForget: (root: string) => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>{t("Git 分支")}</h1>
        <p className="muted">{t("打开一个文件夹，管理它所在仓库的分支、提交和改动。可以同时打开多个工作区，在顶部标签间切换。")}</p>
        <button className="btn primary large" onClick={onPick}>
          <IconFolder /> {t("打开文件夹…")}
        </button>
        {recent.length > 0 && (
          <div className="recent">
            <div className="recent-title">{t("最近打开")}</div>
            {recent.map(r => (
              <div key={r} className="recent-row" onClick={() => onOpen(r)}>
                <span className="recent-name">{r.split("/").pop()}</span>
                <span className="recent-path">{r}</span>
                <button
                  className="mini"
                  title={t("从列表移除")}
                  onClick={e => {
                    e.stopPropagation();
                    onForget(r);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
