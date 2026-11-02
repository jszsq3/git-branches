import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";

import { git } from "./lib/git";
import { findRoot } from "./lib/repo";
import { forgetRepo, recentRepos, rememberRepo } from "./lib/storage";
import { DialogsProvider, useDialogs } from "./state/dialogs";
import { RepoProvider } from "./state/repo-context";
import { IconFolder } from "./components/icons";
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
  const [recent, setRecent] = useState<string[]>(recentRepos);
  const [root, setRoot] = useState<string | null>(null);

  const openRepo = useCallback(
    async (folder: string) => {
      let found = await findRoot(folder).catch(() => null);
      if (!found) {
        const ok = await dialogs.confirm({
          title: "不是 Git 仓库",
          message: `${folder} 不在任何 Git 仓库中。要在这里初始化一个新仓库吗？`,
          confirmLabel: "初始化仓库",
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
          await dialogs.alert("初始化失败", e instanceof Error ? e.message : String(e));
          return;
        }
      }
      rememberRepo(found);
      setRecent(recentRepos());
      setRoot(found);
      document.title = `${found.split("/").pop()} — Git 分支`;
    },
    [dialogs],
  );

  const pickFolder = useCallback(async () => {
    const picked = await open({ directory: true, multiple: false, title: "选择包含 Git 仓库的文件夹" });
    if (typeof picked === "string") await openRepo(picked);
  }, [openRepo]);

  // 启动时直接回到上次打开的仓库
  useEffect(() => {
    const last = recentRepos()[0];
    if (last) void openRepo(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!root) {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>Git 分支</h1>
          <p className="muted">打开一个文件夹，管理它所在仓库的分支、提交和改动。</p>
          <button className="btn primary large" onClick={() => void pickFolder()}>
            <IconFolder /> 打开文件夹…
          </button>
          {recent.length > 0 && (
            <div className="recent">
              <div className="recent-title">最近打开</div>
              {recent.map(r => (
                <div key={r} className="recent-row" onClick={() => void openRepo(r)}>
                  <span className="recent-name">{r.split("/").pop()}</span>
                  <span className="recent-path">{r}</span>
                  <button
                    className="mini"
                    title="从列表移除"
                    onClick={e => {
                      e.stopPropagation();
                      forgetRepo(r);
                      setRecent(recentRepos());
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

  return (
    <RepoProvider root={root}>
      <Workspace recent={recent} onOpenRepo={r => void openRepo(r)} onPickFolder={() => void pickFolder()} />
    </RepoProvider>
  );
}
