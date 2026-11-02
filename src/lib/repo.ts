import { invoke } from "@tauri-apps/api/core";

import { git, runGit, REC, SEP } from "./git";

export type RefKind = "local" | "remote" | "tag";

export type Ref = {
  kind: RefKind;
  /** 短名，如 `feat-coe`、`origin/master`、`v1.0` */
  name: string;
  sha: string;
  date: number;
  subject: string;
  upstream: string;
  ahead: number;
  behind: number;
  isGone: boolean;
};

export type RepoState = "merging" | "rebasing" | "cherry-picking" | "reverting" | null;

export type Head = {
  /** 分支名；游离时为空 */
  branch: string;
  sha: string;
  state: RepoState;
};

export type Commit = {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  date: number;
  subject: string;
  refs: string[];
};

export type CommitInfo = Commit & {
  committer: string;
  commitDate: number;
  body: string;
};

export type FileChange = {
  /** A、M、D、R、C、T、U 或 ? */
  status: string;
  path: string;
  oldPath?: string;
};

export type StatusEntry = {
  path: string;
  oldPath?: string;
  index: string;
  worktree: string;
};

export type Status = {
  staged: FileChange[];
  unstaged: FileChange[];
  conflicts: FileChange[];
};

/** 返回 `path` 所在仓库的根目录；不在仓库中时返回 null。 */
export async function findRoot(path: string): Promise<string | null> {
  const out = await runGit(path, ["rev-parse", "--show-toplevel"]);
  return out.code === 0 ? out.stdout.trim() : null;
}

const REF_FORMAT = [
  "%(refname)",
  "%(objectname)",
  "%(committerdate:unix)",
  "%(upstream:short)",
  "%(upstream:track,nobracket)",
  "%(subject)",
].join(SEP);

export async function loadRefs(root: string): Promise<Ref[]> {
  const out = await git(root, [
    "for-each-ref",
    `--format=${REF_FORMAT}`,
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ]);
  const refs: Ref[] = [];
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [full = "", sha = "", date = "0", upstream = "", track = "", subject = ""] = line.split(SEP);
    let kind: RefKind;
    let name: string;
    if (full.startsWith("refs/heads/")) {
      kind = "local";
      name = full.slice(11);
    } else if (full.startsWith("refs/remotes/")) {
      kind = "remote";
      name = full.slice(13);
      // `origin/HEAD` 只是指向默认分支的指针
      if (!name.includes("/") || name.endsWith("/HEAD")) continue;
    } else {
      kind = "tag";
      name = full.slice(10);
    }
    refs.push({
      kind,
      name,
      sha,
      date: Number(date) * 1000,
      subject,
      upstream,
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
      isGone: track === "gone",
    });
  }
  return refs;
}

export async function loadHead(root: string): Promise<Head> {
  const [branch, sha, paths] = await Promise.all([
    runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]),
    runGit(root, ["rev-parse", "HEAD"]),
    runGit(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "MERGE_HEAD",
      "--git-path",
      "rebase-merge",
      "--git-path",
      "rebase-apply",
      "--git-path",
      "CHERRY_PICK_HEAD",
      "--git-path",
      "REVERT_HEAD",
    ]),
  ]);
  const [merge, rebaseMerge, rebaseApply, pick, revert] = paths.stdout.trim().split("\n");
  const exists = (p?: string) => (p ? invoke<boolean>("path_exists", { path: p }) : Promise.resolve(false));
  let state: RepoState = null;
  if ((await exists(rebaseMerge)) || (await exists(rebaseApply))) state = "rebasing";
  else if (await exists(merge)) state = "merging";
  else if (await exists(pick)) state = "cherry-picking";
  else if (await exists(revert)) state = "reverting";
  return {
    branch: branch.code === 0 ? branch.stdout.trim() : "",
    sha: sha.code === 0 ? sha.stdout.trim() : "",
    state,
  };
}

export type LogQuery = {
  /** 空数组表示全部分支 */
  revs: string[];
  text: string;
  author: string;
  skip: number;
  limit: number;
};

const LOG_FORMAT = ["%H", "%P", "%an", "%ae", "%at", "%s", "%D"].join(SEP) + REC;

export async function loadLog(root: string, q: LogQuery): Promise<Commit[]> {
  const args = ["log", "--date-order", `--format=${LOG_FORMAT}`, `--skip=${q.skip}`, `-n${q.limit}`];
  const text = q.text.trim();
  if (text) {
    if (/^[0-9a-f]{4,40}$/i.test(text)) {
      // 像哈希就按哈希找
      const out = await runGit(root, ["log", "-1", `--format=${LOG_FORMAT}`, text]);
      if (out.code === 0) return parseLog(out.stdout);
    }
    args.push("-i", "--fixed-strings", `--grep=${text}`);
  }
  if (q.author.trim()) args.push(`--author=${q.author.trim()}`);
  if (q.revs.length) args.push(...q.revs);
  else args.push("--branches", "--remotes", "--tags", "HEAD");
  args.push("--");
  const out = await runGit(root, args);
  // 空仓库没有 HEAD 时 log 会失败，按无提交处理
  return out.code === 0 ? parseLog(out.stdout) : [];
}

function parseLog(out: string): Commit[] {
  return out
    .split(REC)
    .map(s => s.replace(/^\n/, ""))
    .filter(Boolean)
    .map(rec => {
      const [sha = "", parents = "", author = "", email = "", date = "0", subject = "", refs = ""] = rec.split(SEP);
      return {
        sha,
        parents: parents ? parents.split(" ") : [],
        author,
        email,
        date: Number(date) * 1000,
        subject,
        refs: refs ? refs.split(", ").filter(r => !r.endsWith("/HEAD")) : [],
      };
    });
}

export async function loadCommit(root: string, sha: string): Promise<CommitInfo> {
  const format = ["%H", "%P", "%an", "%ae", "%at", "%s", "%D", "%cn", "%ct", "%b"].join(SEP);
  const out = await git(root, ["show", "-s", `--format=${format}`, sha]);
  const [h = "", parents = "", author = "", email = "", date = "0", subject = "", refs = "", cn = "", ct = "0", body = ""] =
    out.split(SEP);
  return {
    sha: h,
    parents: parents ? parents.split(" ") : [],
    author,
    email,
    date: Number(date) * 1000,
    subject,
    refs: refs ? refs.split(", ") : [],
    committer: cn,
    commitDate: Number(ct) * 1000,
    body: body.trim(),
  };
}

/** 提交相对第一个父提交改了哪些文件；根提交相对空树。 */
export async function loadCommitFiles(root: string, commit: { sha: string; parents: string[] }): Promise<FileChange[]> {
  const args = commit.parents.length
    ? ["diff", "--name-status", "-z", "-M", `${commit.sha}^1`, commit.sha]
    : ["diff-tree", "--root", "--no-commit-id", "-r", "--name-status", "-z", "-M", commit.sha];
  return parseNameStatus(await git(root, args));
}

export async function loadRangeFiles(root: string, from: string, to: string): Promise<FileChange[]> {
  return parseNameStatus(await git(root, ["diff", "--name-status", "-z", "-M", `${from}...${to}`]));
}

function parseNameStatus(out: string): FileChange[] {
  const parts = out.split("\0");
  const files: FileChange[] = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    if (!code) continue;
    const status = code[0] ?? "M";
    if (status === "R" || status === "C") {
      const oldPath = parts[i++] ?? "";
      const path = parts[i++] ?? "";
      files.push({ status, path, oldPath });
    } else {
      files.push({ status, path: parts[i++] ?? "" });
    }
  }
  return files;
}

export async function loadCommitDiff(
  root: string,
  commit: { sha: string; parents: string[] },
  file: FileChange,
): Promise<string> {
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path];
  const args = commit.parents.length
    ? ["diff", "-M", `${commit.sha}^1`, commit.sha, "--", ...paths]
    : ["show", "--format=", "-M", commit.sha, "--", ...paths];
  return git(root, args);
}

export async function loadRangeDiff(root: string, from: string, to: string, file: FileChange): Promise<string> {
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path];
  return git(root, ["diff", "-M", `${from}...${to}`, "--", ...paths]);
}

export async function loadStatus(root: string): Promise<Status> {
  const out = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const parts = out.split("\0");
  const status: Status = { staged: [], unstaged: [], conflicts: [] };
  for (let i = 0; i < parts.length; ) {
    const entry = parts[i++];
    if (!entry) continue;
    const x = entry[0] ?? " ";
    const y = entry[1] ?? " ";
    const path = entry.slice(3);
    const oldPath = x === "R" || x === "C" ? parts[i++] : undefined;
    const xy = x + y;
    if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(xy)) {
      status.conflicts.push({ status: "U", path });
      continue;
    }
    if (xy === "??") {
      status.unstaged.push({ status: "?", path });
      continue;
    }
    if (x !== " ") status.staged.push({ status: x, path, oldPath });
    if (y !== " ") status.unstaged.push({ status: y, path });
  }
  return status;
}

export async function loadWorkingDiff(root: string, file: FileChange, isStaged: boolean): Promise<string> {
  if (file.status === "?") {
    // 未跟踪文件和空文件比较；有差异时退出码为 1
    const out = await runGit(root, ["diff", "--no-index", "--", "/dev/null", file.path]);
    return out.stdout;
  }
  const paths = file.oldPath ? [file.oldPath, file.path] : [file.path];
  return git(root, ["diff", ...(isStaged ? ["--cached"] : []), "-M", "--", ...paths]);
}

export async function lastCommitMessage(root: string): Promise<string> {
  const out = await runGit(root, ["log", "-1", "--format=%B"]);
  return out.code === 0 ? out.stdout.trim() : "";
}

export async function branchesContaining(root: string, sha: string): Promise<string[]> {
  const out = await runGit(root, ["branch", "-a", "--format=%(refname:short)", "--contains", sha]);
  return out.stdout.split("\n").filter(b => b && !b.endsWith("/HEAD"));
}

export async function remotes(root: string): Promise<string[]> {
  return (await git(root, ["remote"])).split("\n").filter(Boolean);
}
