import { useEffect, useState } from "react";

import { formatFullDate } from "../lib/format";
import { branchesContaining, loadCommit, loadCommitFiles, loadRangeFiles } from "../lib/repo";
import type { CommitInfo, FileChange } from "../lib/repo";
import { useRepo } from "../state/repo-context";
import { FileRow } from "./FileList";
import { RefBadges } from "./LogView";

/** 右侧详情：选中提交的信息与改动文件；比较模式下显示两个分支间的改动文件。 */
export function CommitDetails({
  sha,
  range,
  selectedFile,
  onSelectFile,
  onSelectSha,
}: {
  sha: string | null;
  range: { from: string; to: string } | null;
  selectedFile: FileChange | null;
  onSelectFile: (f: FileChange, commit: CommitInfo | null) => void;
  onSelectSha: (sha: string) => void;
}) {
  const { root, version } = useRepo();
  const [info, setInfo] = useState<CommitInfo | null>(null);
  const [files, setFiles] = useState<FileChange[]>([]);
  const [contains, setContains] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    setContains(null);
    if (sha) {
      void (async () => {
        try {
          const c = await loadCommit(root, sha);
          const f = await loadCommitFiles(root, c);
          if (!alive) return;
          setInfo(c);
          setFiles(f);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        }
      })();
    } else if (range) {
      setInfo(null);
      void loadRangeFiles(root, range.from, range.to)
        .then(f => alive && setFiles(f))
        .catch(e => alive && setError(String(e)));
    } else {
      setInfo(null);
      setFiles([]);
    }
    return () => {
      alive = false;
    };
  }, [root, sha, range?.from, range?.to, version]);

  if (!sha && !range) return <div className="details empty">选择一个提交查看详情</div>;
  if (error) return <div className="details empty error">{error}</div>;

  return (
    <div className="details">
      {info && (
        <div className="commit-info">
          <div className="commit-subject">{info.subject}</div>
          {info.body && <pre className="commit-body">{info.body}</pre>}
          <RefBadges refs={info.refs} />
          <dl className="meta">
            <dt>提交</dt>
            <dd>
              <span className="mono selectable">{info.sha}</span>
              <button className="link" onClick={() => void navigator.clipboard.writeText(info.sha)}>
                复制
              </button>
            </dd>
            <dt>作者</dt>
            <dd>
              {info.author} <span className="muted">&lt;{info.email}&gt;</span>
              <div className="muted">{formatFullDate(info.date)}</div>
            </dd>
            {(info.committer !== info.author || info.commitDate !== info.date) && (
              <>
                <dt>提交者</dt>
                <dd>
                  {info.committer}
                  <div className="muted">{formatFullDate(info.commitDate)}</div>
                </dd>
              </>
            )}
            {info.parents.length > 0 && (
              <>
                <dt>父提交</dt>
                <dd>
                  {info.parents.map(p => (
                    <button key={p} className="link mono" onClick={() => onSelectSha(p)}>
                      {p.slice(0, 8)}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt>所在分支</dt>
            <dd>
              {contains === null ? (
                <button className="link" onClick={() => void branchesContaining(root, info.sha).then(setContains)}>
                  查询
                </button>
              ) : contains.length === 0 ? (
                <span className="muted">不在任何分支上</span>
              ) : (
                <span className="contains">{contains.slice(0, 30).join("、") + (contains.length > 30 ? ` 等 ${contains.length} 个` : "")}</span>
              )}
            </dd>
          </dl>
        </div>
      )}
      {range && !info && (
        <div className="commit-info">
          <div className="commit-subject">
            {range.from} … {range.to}
          </div>
          <div className="muted">自分叉点以来 {range.to} 上改动的文件</div>
        </div>
      )}
      <div className="files-head">
        {files.length} 个文件
        {info && info.parents.length > 1 && <span className="muted">（相对第一个父提交）</span>}
      </div>
      <div className="files">
        {files.map(f => (
          <FileRow
            key={`${f.oldPath ?? ""}>${f.path}`}
            root={root}
            file={f}
            isSelected={selectedFile?.path === f.path}
            onSelect={() => onSelectFile(f, info)}
          />
        ))}
      </div>
    </div>
  );
}
