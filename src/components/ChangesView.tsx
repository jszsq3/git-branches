import { useEffect, useState } from "react";

import { t } from "../lib/i18n";
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
      .then(text => alive && setDiff(text))
      .catch(e => alive && setDiffError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [root, picked, version]);

  const stage = (paths: string[]) => run(t("暂存"), ["add", "--", ...paths]);
  const unstage = (paths: string[]) =>
    head.sha
      ? run(t("取消暂存"), ["restore", "--staged", "--", ...paths])
      : run(t("取消暂存"), ["rm", "--cached", "-r", "--", ...paths]);
  const discard = async (files: FileChange[]) => {
    const untracked = files.filter(f => f.status === "?").map(f => f.path);
    const tracked = files.filter(f => f.status !== "?").map(f => f.path);
    const what =
      files.length === 1
        ? t("还原 {path} 的未暂存改动？", { path: files[0]?.path ?? "" })
        : t("还原 {n} 个文件的未暂存改动？", { n: files.length });
    const untrackedNote = !untracked.length
      ? ""
      : files.length === 1
        ? t("这是未跟踪文件，会被直接删除。")
        : t("其中 {n} 个未跟踪文件会被直接删除。", { n: untracked.length });
    const ok = await dialogs.confirm({
      title: t("还原改动"),
      message: `${what}${untrackedNote}${t("此操作无法撤销。")}`,
      confirmLabel: t("还原"),
      isDanger: true,
    });
    if (!ok) return;
    if (tracked.length) await run(t("还原"), ["restore", "--", ...tracked]);
    if (untracked.length) await run(t("删除未跟踪文件"), ["clean", "-f", "--", ...untracked]);
  };

  const resolveWith = (path: string, side: "ours" | "theirs") =>
    run(side === "ours" ? t("采用我方版本") : t("采用对方版本"), ["checkout", `--${side}`, "--", path]).then(
      ok => ok && run(t("标记已解决"), ["add", "--", path]),
    );

  const commit = async (andPush: boolean) => {
    const msg = message.trim();
    if (!msg) return;
    const ok = await run(isAmend ? t("修改上次提交") : t("提交"), ["commit", "-F", "-", ...(isAmend ? ["--amend"] : [])], {
      stdin: msg + "\n",
    });
    if (!ok) return;
    setMessage("");
    setIsAmend(false);
    if (andPush) {
      const branch = refs.find(r => r.kind === "local" && r.name === head.branch);
      const args = branch?.upstream ? ["push", ...(isAmend ? ["--force-with-lease"] : [])] : ["push", "-u", "origin", "HEAD"];
      await run(t("推送"), args);
    }
  };

  const toggleAmend = async (checked: boolean) => {
    setIsAmend(checked);
    if (checked && !message.trim()) setMessage(await lastCommitMessage(root));
  };

  const canCommit =
    Boolean(message.trim()) && !busy && status.conflicts.length === 0 && (status.staged.length > 0 || isAmend || head.state === "merging");

  const stateLabel: Record<string, string> = {
    merging: t("合并"),
    rebasing: t("变基"),
    "cherry-picking": t("拣选"),
    reverting: t("还原提交"),
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
              {status.conflicts.length > 0
                ? t("正在{op}，还有 {n} 个冲突文件", { op: stateLabel[head.state] ?? "", n: status.conflicts.length })
                : t("正在{op}，冲突已解决", { op: stateLabel[head.state] ?? "" })}
            </div>
            <div className="state-actions">
              <button
                className="btn small primary"
                disabled={status.conflicts.length > 0 || Boolean(busy)}
                onClick={() =>
                  void run(t("继续{op}", { op: stateLabel[head.state!] ?? "" }), [stateCmd[head.state!]!, "--continue"])
                }
              >
                {t("继续")}
              </button>
              <button
                className="btn small"
                disabled={Boolean(busy)}
                onClick={async () => {
                  const op = stateLabel[head.state!] ?? "";
                  const ok = await dialogs.confirm({
                    title: t("中止{op}", { op }),
                    message: t("回到开始之前的状态，已解决的冲突会丢失。"),
                    confirmLabel: t("中止"),
                    isDanger: true,
                  });
                  if (ok) await run(t("中止{op}", { op }), [stateCmd[head.state!]!, "--abort"]);
                }}
              >
                {t("中止")}
              </button>
            </div>
          </div>
        )}
        <div className="change-lists">
          {status.conflicts.length > 0 && (
            <ChangeGroup title={t("冲突")} count={status.conflicts.length}>
              {status.conflicts.map(f => (
                <FileRow
                  key={`c:${f.path}`}
                  root={root}
                  file={f}
                  isSelected={isPicked(f, "conflict")}
                  onSelect={() => setPicked({ file: f, area: "conflict" })}
                  menuExtra={[
                    { label: t("采用我方版本"), onSelect: () => void resolveWith(f.path, "ours") },
                    { label: t("采用对方版本"), onSelect: () => void resolveWith(f.path, "theirs") },
                    { label: t("标记已解决"), onSelect: () => void stage([f.path]) },
                  ]}
                  trailing={
                    <button
                      className="mini"
                      title={t("解决完冲突后标记为已解决")}
                      onClick={e => (e.stopPropagation(), void stage([f.path]))}
                    >
                      {t("已解决")}
                    </button>
                  }
                />
              ))}
            </ChangeGroup>
          )}
          <ChangeGroup
            title={t("已暂存")}
            count={status.staged.length}
            action={
              status.staged.length > 0 && (
                <button className="mini" onClick={() => void unstage(status.staged.map(f => f.path))}>
                  {t("全部取消")}
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
                menuExtra={[{ label: t("取消暂存"), onSelect: () => void unstage([f.path]) }]}
                trailing={
                  <button className="mini" title={t("取消暂存")} onClick={e => (e.stopPropagation(), void unstage([f.path]))}>
                    −
                  </button>
                }
              />
            ))}
          </ChangeGroup>
          <ChangeGroup
            title={t("未暂存")}
            count={status.unstaged.length}
            action={
              status.unstaged.length > 0 && (
                <>
                  <button className="mini" onClick={() => void discard(status.unstaged)}>
                    {t("全部还原")}
                  </button>
                  <button className="mini" onClick={() => void stage(status.unstaged.map(f => f.path))}>
                    {t("全部暂存")}
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
                  { label: t("暂存"), onSelect: () => void stage([f.path]) },
                  { label: f.status === "?" ? t("删除文件…") : t("还原改动…"), onSelect: () => void discard([f]), isDanger: true },
                ]}
                trailing={
                  <button className="mini" title={t("暂存")} onClick={e => (e.stopPropagation(), void stage([f.path]))}>
                    +
                  </button>
                }
              />
            ))}
          </ChangeGroup>
          {status.staged.length + status.unstaged.length + status.conflicts.length === 0 && (
            <div className="empty">{t("工作区干净，没有改动")}</div>
          )}
        </div>
        <div className="commit-box">
          <textarea
            className="input commit-message"
            placeholder={t("提交信息（提交到 {branch}）", { branch: head.branch || t("游离 HEAD") })}
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
              {t("修改上次提交")}
            </label>
            <span className="spacer" />
            <button className="btn" disabled={!canCommit} onClick={() => void commit(true)}>
              {t("提交并推送")}
            </button>
            <button className="btn primary" disabled={!canCommit} onClick={() => void commit(false)} title="⌘↩">
              {t("提交")}
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
            title={picked.area === "staged" ? t("已暂存的改动") : picked.area === "conflict" ? t("冲突") : t("未暂存的改动")}
          />
        ) : (
          <div className="empty">{t("选择一个文件查看改动")}</div>
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
