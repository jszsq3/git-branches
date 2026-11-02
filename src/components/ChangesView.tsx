import { useEffect, useState } from "react";

import { lastCommitMessage, loadWorkingDiff } from "../lib/repo";
import type { FileChange } from "../lib/repo";
import { useDialogs } from "../state/dialogs";
import { useRepo } from "../state/repo-context";
import { DiffView } from "./DiffView";
import { FileRow } from "./FileList";

type Picked = { file: FileChange; area: "staged" | "unstaged" | "conflict" };

export function ChangesView() {
  const { root, status, head, version, run, busy, refs } = useRepo();
  const dialogs = useDialogs();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [diffError, setDiffError] = useState("");
  const [message, setMessage] = useState("");
  const [isAmend, setIsAmend] = useState(false);

  // 选中的文件已不在原区域（被暂存、提交或还原）时换到它的新位置，或清空
  useEffect(() => {
    if (!picked) return;
    const where = (
      [
        ["conflict", status.conflicts],
        ["staged", status.staged],
        ["unstaged", status.unstaged],
      ] as const
    ).find(([, list]) => list.some(f => f.path === picked.file.path));
    if (!where) setPicked(null);
    else if (where[0] !== picked.area || !where[1].some(f => f.path === picked.file.path && f.status === picked.file.status)) {
      const file = where[1].find(f => f.path === picked.file.path);
      if (file) setPicked({ file, area: where[0] });
    }
  }, [status, picked]);

  useEffect(() => {
    if (!picked) return;
    let alive = true;
    setDiff(null);
    setDiffError("");
    loadWorkingDiff(root, picked.file, picked.area === "staged")
      .then(t => alive && setDiff(t))
      .catch(e => alive && setDiffError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [root, picked, version]);

  const stage = (paths: string[]) => run("暂存", ["add", "--", ...paths]);
  const unstage = (paths: string[]) =>
    head.sha ? run("取消暂存", ["restore", "--staged", "--", ...paths]) : run("取消暂存", ["rm", "--cached", "-r", "--", ...paths]);
  const discard = async (files: FileChange[]) => {
    const untracked = files.filter(f => f.status === "?").map(f => f.path);
    const tracked = files.filter(f => f.status !== "?").map(f => f.path);
    const ok = await dialogs.confirm({
      title: "还原改动",
      message:
        files.length === 1
          ? `还原 ${files[0]?.path} 的未暂存改动？${untracked.length ? "这是未跟踪文件，会被直接删除。" : ""}此操作无法撤销。`
          : `还原 ${files.length} 个文件的未暂存改动？${untracked.length ? `其中 ${untracked.length} 个未跟踪文件会被直接删除。` : ""}此操作无法撤销。`,
      confirmLabel: "还原",
      isDanger: true,
    });
    if (!ok) return;
    if (tracked.length) await run("还原", ["restore", "--", ...tracked]);
    if (untracked.length) await run("删除未跟踪文件", ["clean", "-f", "--", ...untracked]);
  };

  const resolveWith = (path: string, side: "ours" | "theirs") =>
    run(`采用${side === "ours" ? "我方" : "对方"}版本`, ["checkout", `--${side}`, "--", path]).then(
      ok => ok && run("标记已解决", ["add", "--", path]),
    );

  const commit = async (andPush: boolean) => {
    const msg = message.trim();
    if (!msg) return;
    const ok = await run(isAmend ? "修改上次提交" : "提交", ["commit", "-F", "-", ...(isAmend ? ["--amend"] : [])], { stdin: msg + "\n" });
    if (!ok) return;
    setMessage("");
    setIsAmend(false);
    if (andPush) {
      const branch = refs.find(r => r.kind === "local" && r.name === head.branch);
      const args = branch?.upstream ? ["push", ...(isAmend ? ["--force-with-lease"] : [])] : ["push", "-u", "origin", "HEAD"];
      await run("推送", args);
    }
  };

  const toggleAmend = async (checked: boolean) => {
    setIsAmend(checked);
    if (checked && !message.trim()) setMessage(await lastCommitMessage(root));
  };

  const canCommit =
    Boolean(message.trim()) && !busy && status.conflicts.length === 0 && (status.staged.length > 0 || isAmend || head.state === "merging");

  const stateLabel: Record<string, string> = {
    merging: "合并",
    rebasing: "变基",
    "cherry-picking": "拣选",
    reverting: "还原提交",
  };
  const stateCmd: Record<string, string> = {
    merging: "merge",
    rebasing: "rebase",
    "cherry-picking": "cherry-pick",
    reverting: "revert",
  };

  const isPicked = (f: FileChange, area: Picked["area"]) => picked?.area === area && picked.file.path === f.path;

  return (
    <div className="changes">
      <div className="changes-left">
        {head.state && (
          <div className="state-banner">
            <div>
              正在{stateLabel[head.state]}
              {status.conflicts.length > 0 ? `，还有 ${status.conflicts.length} 个冲突文件` : "，冲突已解决"}
            </div>
            <div className="state-actions">
              <button
                className="btn small primary"
                disabled={status.conflicts.length > 0 || Boolean(busy)}
                onClick={() => void run(`继续${stateLabel[head.state!]}`, [stateCmd[head.state!]!, "--continue"])}
              >
                继续
              </button>
              <button
                className="btn small"
                disabled={Boolean(busy)}
                onClick={async () => {
                  const ok = await dialogs.confirm({
                    title: `中止${stateLabel[head.state!]}`,
                    message: "回到开始之前的状态，已解决的冲突会丢失。",
                    confirmLabel: "中止",
                    isDanger: true,
                  });
                  if (ok) await run(`中止${stateLabel[head.state!]}`, [stateCmd[head.state!]!, "--abort"]);
                }}
              >
                中止
              </button>
            </div>
          </div>
        )}
        <div className="change-lists">
          {status.conflicts.length > 0 && (
            <ChangeGroup title="冲突" count={status.conflicts.length}>
              {status.conflicts.map(f => (
                <FileRow
                  key={`c:${f.path}`}
                  root={root}
                  file={f}
                  isSelected={isPicked(f, "conflict")}
                  onSelect={() => setPicked({ file: f, area: "conflict" })}
                  menuExtra={[
                    { label: "采用我方版本", onSelect: () => void resolveWith(f.path, "ours") },
                    { label: "采用对方版本", onSelect: () => void resolveWith(f.path, "theirs") },
                    { label: "标记已解决", onSelect: () => void stage([f.path]) },
                  ]}
                  trailing={
                    <button className="mini" title="解决完冲突后标记为已解决" onClick={e => (e.stopPropagation(), void stage([f.path]))}>
                      已解决
                    </button>
                  }
                />
              ))}
            </ChangeGroup>
          )}
          <ChangeGroup
            title="已暂存"
            count={status.staged.length}
            action={
              status.staged.length > 0 && (
                <button className="mini" onClick={() => void unstage(status.staged.map(f => f.path))}>
                  全部取消
                </button>
              )
            }
          >
            {status.staged.map(f => (
              <FileRow
                key={`s:${f.path}`}
                root={root}
                file={f}
                isSelected={isPicked(f, "staged")}
                onSelect={() => setPicked({ file: f, area: "staged" })}
                menuExtra={[{ label: "取消暂存", onSelect: () => void unstage([f.path]) }]}
                trailing={
                  <button className="mini" title="取消暂存" onClick={e => (e.stopPropagation(), void unstage([f.path]))}>
                    −
                  </button>
                }
              />
            ))}
          </ChangeGroup>
          <ChangeGroup
            title="未暂存"
            count={status.unstaged.length}
            action={
              status.unstaged.length > 0 && (
                <>
                  <button className="mini" onClick={() => void discard(status.unstaged)}>
                    全部还原
                  </button>
                  <button className="mini" onClick={() => void stage(status.unstaged.map(f => f.path))}>
                    全部暂存
                  </button>
                </>
              )
            }
          >
            {status.unstaged.map(f => (
              <FileRow
                key={`u:${f.path}`}
                root={root}
                file={f}
                isSelected={isPicked(f, "unstaged")}
                onSelect={() => setPicked({ file: f, area: "unstaged" })}
                menuExtra={[
                  { label: "暂存", onSelect: () => void stage([f.path]) },
                  { label: f.status === "?" ? "删除文件…" : "还原改动…", onSelect: () => void discard([f]), isDanger: true },
                ]}
                trailing={
                  <button className="mini" title="暂存" onClick={e => (e.stopPropagation(), void stage([f.path]))}>
                    +
                  </button>
                }
              />
            ))}
          </ChangeGroup>
          {status.staged.length + status.unstaged.length + status.conflicts.length === 0 && (
            <div className="empty">工作区干净，没有改动</div>
          )}
        </div>
        <div className="commit-box">
          <textarea
            className="input commit-message"
            placeholder={`提交信息（提交到 ${head.branch || "游离 HEAD"}）`}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) void commit(false);
            }}
            spellCheck={false}
          />
          <div className="commit-actions">
            <label className="checkbox">
              <input type="checkbox" checked={isAmend} disabled={!head.sha} onChange={e => void toggleAmend(e.target.checked)} />
              修改上次提交
            </label>
            <span className="spacer" />
            <button className="btn" disabled={!canCommit} onClick={() => void commit(true)}>
              提交并推送
            </button>
            <button className="btn primary" disabled={!canCommit} onClick={() => void commit(false)} title="⌘↩">
              提交
            </button>
          </div>
        </div>
      </div>
      <div className="changes-right">
        {picked ? (
          <DiffView
            root={root}
            file={picked.file}
            text={diff}
            error={diffError}
            title={picked.area === "staged" ? "已暂存的改动" : picked.area === "conflict" ? "冲突" : "未暂存的改动"}
          />
        ) : (
          <div className="empty">选择一个文件查看改动</div>
        )}
      </div>
    </div>
  );
}

function ChangeGroup({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="change-group">
      <div className="group-head">
        <span className="group-title">{title}</span>
        <span className="count">{count}</span>
        <span className="spacer" />
        {action}
      </div>
      {children}
    </div>
  );
}
