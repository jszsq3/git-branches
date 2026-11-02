import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { GitError, runGit } from "../lib/git";
import { loadHead, loadRefs, loadStatus, remotes as loadRemotes } from "../lib/repo";
import type { Head, Ref, Status } from "../lib/repo";
import { favorites as readFavorites, setFavorites } from "../lib/storage";
import { useDialogs } from "./dialogs";

export type OpOptions = {
  /** 失败时不弹窗，由调用方处理 */
  quiet?: boolean;
  stdin?: string;
};

type RepoValue = {
  root: string;
  refs: Ref[];
  head: Head;
  status: Status;
  remotes: string[];
  favorites: string[];
  /** 每次刷新加一，依赖仓库内容的视图据此重新加载 */
  version: number;
  busy: string;
  reload: () => Promise<void>;
  /** 执行会修改仓库的 git 命令：显示进行中、失败时弹出错误、结束后刷新 */
  run: (label: string, args: string[], options?: OpOptions) => Promise<boolean>;
  toggleFavorite: (name: string) => void;
};

const RepoContext = createContext<RepoValue | null>(null);

const EMPTY_STATUS: Status = { staged: [], unstaged: [], conflicts: [] };

export function RepoProvider({ root, children }: { root: string; children: ReactNode }) {
  const dialogs = useDialogs();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [head, setHead] = useState<Head>({ branch: "", sha: "", state: null });
  const [status, setStatus] = useState<Status>(EMPTY_STATUS);
  const [remotes, setRemotes] = useState<string[]>([]);
  const [favorites, setFavs] = useState<string[]>(() => readFavorites(root));
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const loading = useRef(false);

  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [r, h, s, rm] = await Promise.all([loadRefs(root), loadHead(root), loadStatus(root), loadRemotes(root)]);
      setRefs(r);
      setHead(h);
      setStatus(s);
      setRemotes(rm);
      setVersion(v => v + 1);
    } catch (error) {
      void dialogs.alert("读取仓库失败", String(error instanceof Error ? error.message : error));
    } finally {
      loading.current = false;
    }
  }, [root, dialogs]);

  useEffect(() => {
    setFavs(readFavorites(root));
    void reload();
  }, [root, reload]);

  // 切回窗口时刷新，外部终端或编辑器的改动随之可见
  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const run = useCallback(
    async (label: string, args: string[], options: OpOptions = {}) => {
      setBusy(label);
      try {
        const out = await runGit(root, args, options.stdin);
        if (out.code !== 0) {
          if (!options.quiet) {
            await dialogs.alert(`${label}失败`, new GitError(args, out).message);
          }
          return false;
        }
        return true;
      } catch (error) {
        if (!options.quiet) await dialogs.alert(`${label}失败`, String(error));
        return false;
      } finally {
        setBusy("");
        await reload();
      }
    },
    [root, dialogs, reload],
  );

  const toggleFavorite = useCallback(
    (name: string) => {
      setFavs(list => {
        const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name];
        setFavorites(root, next);
        return next;
      });
    },
    [root],
  );

  const value = useMemo(
    () => ({ root, refs, head, status, remotes, favorites, version, busy, reload, run, toggleFavorite }),
    [root, refs, head, status, remotes, favorites, version, busy, reload, run, toggleFavorite],
  );
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo(): RepoValue {
  const value = useContext(RepoContext);
  if (!value) throw new Error("useRepo 必须在 RepoProvider 内使用");
  return value;
}
