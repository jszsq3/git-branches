import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

export type Locale = "zh" | "en";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh", label: "中" },
  { value: "en", label: "EN" },
];

const STORAGE_KEY = "locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // 读不到偏好时按系统语言
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let current: Locale = initialLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

/** 让原生菜单栏跟随当前语言 */
export function syncMenuLocale() {
  document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
  void invoke("set_menu_locale", { locale: current }).catch(() => undefined);
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 存不下时只影响下次启动
  }
  syncMenuLocale();
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 订阅当前语言；语言变化时调用它的组件重新渲染 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/**
 * 以中文原文为键取当前语言的文案，`{name}` 形式的占位符用 params 填充。
 * 英文词典缺项时回退到中文原文。
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const template = current === "en" ? (EN[text] ?? text) : text;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole));
}

const EN: Record<string, string> = {
  // 应用与欢迎页
  "Git 分支": "Git Branches",
  "不是 Git 仓库": "Not a Git repository",
  "{folder} 不在任何 Git 仓库中。要在这里初始化一个新仓库吗？": "{folder} is not inside a Git repository. Initialize a new repository here?",
  初始化仓库: "Initialize repository",
  初始化失败: "Initialization failed",
  "选择包含 Git 仓库的文件夹": "Choose a folder inside a Git repository",
  "打开一个文件夹，管理它所在仓库的分支、提交和改动。可以同时打开多个工作区，在顶部标签间切换。":
    "Open a folder to manage the branches, commits and changes of its repository. Open several workspaces at once and switch between them with the tabs at the top.",
  "打开文件夹…": "Open Folder…",
  最近打开: "Recent",
  从列表移除: "Remove from list",
  读取仓库失败: "Failed to read repository",
  "{label}失败": "{label} failed",
  "git {cmd} 退出码 {code}": "git {cmd} exited with code {code}",

  // 工作区标签栏
  关闭: "Close",
  关闭其他工作区: "Close Other Workspaces",
  复制路径: "Copy Path",
  合并或变基进行中: "Merge or rebase in progress",
  "{n} 个文件有改动": "{n} changed files",
  正在执行: "Running",
  "关闭工作区 (⌘W)": "Close workspace (⌘W)",
  "打开文件夹 (⌘O)": "Open folder (⌘O)",
  "{n} 个工作区": "{n} workspaces",
  界面语言: "Language",

  // 顶部工具栏
  切换或新建分支: "Switch or create branch",
  "游离 {sha}": "Detached {sha}",
  获取: "Fetch",
  "从所有远端获取最新提交，只更新远端分支，不改动本地分支":
    "Fetch the latest commits from all remotes. Updates remote branches only; local branches are left as they are",
  拉取: "Pull",
  把当前分支更新到上游的最新提交: "Update the current branch to the latest commit of its upstream",
  推送: "Push",
  推送当前分支: "Push the current branch",
  刷新: "Refresh",
  日志: "Log",
  提交: "Commit",
  变基中: "Rebasing",
  合并中: "Merging",
  进行中: "In progress",
  "新建分支…": "New Branch…",
  "检出 {name}": "Checkout {name}",

  // 分支树
  "上游分支 {upstream} 已在远端删除": "Upstream {upstream} has been deleted on the remote",
  "相对 {upstream}：领先 {ahead}、落后 {behind}。右键“更新”可快进到上游。":
    "Compared with {upstream}: {ahead} ahead, {behind} behind. Right-click › Update to fast-forward to the upstream.",
  上游已删: "upstream gone",
  新建分支: "New branch",
  从所有远端获取最新提交: "Fetch the latest commits from all remotes",
  "更新 {name}：获取并快进到 {upstream}": "Update {name}: fetch and fast-forward to {upstream}",
  更新选中的本地分支: "Update the selected local branch",
  删除分支: "Delete branch",
  与当前分支比较: "Compare with current branch",
  取消收藏: "Remove from Favorites",
  收藏: "Add to Favorites",
  定位到当前分支: "Locate current branch",
  搜索分支或标签: "Search branches or tags",
  "（当前分支 {name}）": "(current branch {name})",
  "（游离于 {sha}）": "(detached at {sha})",
  本地: "Local",
  远端: "Remote",
  标签: "Tags",

  // 日志与比较
  提交信息或哈希: "Message or hash",
  作者: "Author",
  "分支：{name}": "Branch: {name}",
  显示全部分支: "Show all branches",
  "{n} 个提交": "{n} commits",
  "加载中…": "Loading…",
  没有符合条件的提交: "No matching commits",
  全部: "All",
  "{name} 独有": "only in {name}",
  "比较 {name} 与 {current}：": "Compare {name} with {current}:",
  "{name} 有、当前没有": "In {name}, not in current",
  "当前有、{name} 没有": "In current, not in {name}",
  看改动文件: "Show changed files",
  结束比较: "End comparison",
  刚刚: "just now",
  "{n} 分钟前": "{n} min ago",
  "{n} 小时前": "{n} h ago",

  // 提交详情与差异
  选择一个提交查看详情: "Select a commit to see its details",
  复制: "Copy",
  提交者: "Committer",
  父提交: "Parents",
  所在分支: "Branches",
  查询: "Look up",
  不在任何分支上: "Not on any branch",
  "、": ", ",
  " 等 {n} 个": " and {n} in total",
  "自分叉点以来 {name} 上改动的文件": "Files changed on {name} since the merge base",
  "{n} 个文件": "{n} files",
  "（相对第一个父提交）": "(against the first parent)",
  打开文件: "Open File",
  关闭差异: "Close diff",
  "没有内容差异（可能只改了权限或是空文件）": "No content changes (only permissions changed, or the file is empty)",
  "差异过长，只显示前 {n} 行": "Diff is too long; showing the first {n} lines",
  "在 Finder 中显示": "Reveal in Finder",
  "二进制文件，不显示差异": "Binary file; diff not shown",
  "相似度 {value}": "Similarity {value}",
  文件末尾没有换行: "No newline at end of file",
  新增: "Added",
  修改: "Modified",
  已删除: "Deleted",
  已重命名: "Renamed",
  已复制: "Copied",
  删除: "Delete",
  重命名: "Rename",
  类型变更: "Type changed",
  冲突: "Conflict",
  未跟踪: "Untracked",

  // 提交页
  暂存: "Stage",
  取消暂存: "Unstage",
  "还原 {path} 的未暂存改动？": "Discard unstaged changes in {path}? ",
  "还原 {n} 个文件的未暂存改动？": "Discard unstaged changes in {n} files? ",
  "这是未跟踪文件，会被直接删除。": "This untracked file will be deleted. ",
  "其中 {n} 个未跟踪文件会被直接删除。": "{n} untracked files among them will be deleted. ",
  还原改动: "Discard Changes",
  "此操作无法撤销。": "This cannot be undone.",
  还原: "Discard",
  删除未跟踪文件: "Delete untracked files",
  采用我方版本: "Accept Ours",
  采用对方版本: "Accept Theirs",
  标记已解决: "Mark as Resolved",
  修改上次提交: "Amend last commit",
  合并: "Merge",
  变基: "Rebase",
  拣选: "Cherry-pick",
  还原提交: "Revert",
  "正在{op}，还有 {n} 个冲突文件": "{op} in progress, {n} conflicted files left",
  "正在{op}，冲突已解决": "{op} in progress, conflicts resolved",
  "继续{op}": "Continue {op}",
  继续: "Continue",
  "中止{op}": "Abort {op}",
  "回到开始之前的状态，已解决的冲突会丢失。": "Return to the state before it started. Resolved conflicts will be lost.",
  中止: "Abort",
  解决完冲突后标记为已解决: "Mark as resolved after fixing the conflicts",
  已解决: "Resolved",
  已暂存: "Staged",
  全部取消: "Unstage All",
  未暂存: "Unstaged",
  全部还原: "Discard All",
  全部暂存: "Stage All",
  "删除文件…": "Delete File…",
  "还原改动…": "Discard Changes…",
  "工作区干净，没有改动": "Working tree clean, nothing to commit",
  "提交信息（提交到 {branch}）": "Commit message (to {branch})",
  "游离 HEAD": "detached HEAD",
  提交并推送: "Commit and Push",
  已暂存的改动: "Staged changes",
  未暂存的改动: "Unstaged changes",
  选择一个文件查看改动: "Select a file to see its changes",

  // 分支操作
  不能包含空白: "Must not contain whitespace",
  不是合法的分支名: "Not a valid branch name",
  本地已有同名分支: "A local branch with this name already exists",
  "本地已有 {local}，将直接检出它，不会改成跟踪 {remote}。":
    "{local} already exists locally. It will be checked out as is and will not be changed to track {remote}.",
  "从 {base} 新建分支": "New branch from {base}",
  分支名: "Branch name",
  创建: "Create",
  创建后检出: "Checkout after creating",
  "新建 {name}": "Create {name}",
  "把 {source} 合并到 {target}？有冲突时会停在合并中，解决后在“提交”页继续。":
    "Merge {source} into {target}? On conflicts the merge stops; resolve them and continue on the Commit page.",
  "当前 HEAD": "current HEAD",
  "合并 {name}": "Merge {name}",
  "把 {current} 变基到 {onto} 之上？会改写当前分支未推送的提交。":
    "Rebase {current} onto {onto}? Unpushed commits on the current branch will be rewritten.",
  "变基到 {name}": "Rebase onto {name}",
  无法推送: "Cannot push",
  "这个仓库没有配置远端。": "This repository has no remote configured.",
  强制推送: "Force Push",
  "用 --force-with-lease 把 {name} 推送到 {remote}，远端上别人新推的提交会让推送失败而不是被覆盖。":
    "Push {name} to {remote} with --force-with-lease. If someone else has pushed new commits, the push fails instead of overwriting them.",
  "推送 {name}": "Push {name}",
  "重命名 {name}": "Rename {name}",
  新名称: "New name",
  名称没有变化: "The name has not changed",
  删除远端分支: "Delete Remote Branch",
  "从 {remote} 删除 {branch}？对所有人生效。": "Delete {branch} from {remote}? This affects everyone.",
  "删除 {name}": "Delete {name}",
  删除标签: "Delete Tag",
  "删除本地标签 {name}？远端标签不受影响。": "Delete local tag {name}? Remote tags are not affected.",
  "删除标签 {name}": "Delete tag {name}",
  "删除本地分支 {name}？": "Delete local branch {name}?",
  分支未完全合并: "Branch not fully merged",
  "{name} 上有尚未合并到上游或当前分支的提交。强制删除后，这些提交只能通过 reflog 找回。":
    "{name} has commits that are not merged into its upstream or the current branch. After a force delete they can only be recovered from the reflog.",
  强制删除: "Force Delete",
  "强制删除 {name}": "Force delete {name}",
  无法快进: "Cannot fast-forward",
  "本地和远端都有新提交，不能直接快进。要用合并的方式拉取吗？也可以取消后自己变基。":
    "Both the local and remote branches have new commits, so a fast-forward is not possible. Pull with a merge instead? Or cancel and rebase yourself.",
  合并拉取: "Pull with Merge",
  "更新 {name}": "Update {name}",
  "只有能快进时才会更新。如果 {name} 和 {upstream} 各有对方没有的提交（git 提示 non-fast-forward），请检出 {name} 后用合并或变基处理。":
    "The branch is updated only when it can be fast-forwarded. If {name} and {upstream} both have commits the other lacks (git reports non-fast-forward), check out {name} and merge or rebase.",
  "获取 {name}": "Fetch {name}",
  "检出（游离 HEAD）": "Checkout (detached HEAD)",
  检出: "Checkout",
  "从 {name} 新建分支…": "New Branch from {name}…",
  "（落后 {n}）": " ({n} behind)",
  "更新：获取并快进到 {upstream}": "Update: fetch and fast-forward to {upstream}",
  "更新（没有上游分支）": "Update (no upstream branch)",
  "获取 {name} 的最新提交": "Fetch latest commits of {name}",
  "与 {current} 比较": "Compare with {current}",
  "将 {name} 合并到 {current}": "Merge {name} into {current}",
  "将 {current} 变基到 {name}": "Rebase {current} onto {name}",
  推送并设置上游: "Push and Set Upstream",
  "强制推送…": "Force Push…",
  "重命名…": "Rename…",
  "删除远端分支…": "Delete Remote Branch…",
  "删除标签…": "Delete Tag…",
  "删除…": "Delete…",

  // 检查更新
  检查更新: "Check for updates",
  "检查中…": "Checking…",
  已是最新版本: "You're up to date",
  "当前版本 {version} 已是最新。": "Version {version} is the latest.",
  检查更新失败: "Update check failed",
  "更新服务返回异常（{status}）": "The update service returned an error ({status})",
  "发现新版本 {latest}（当前 {current}）": "Version {latest} is available (current {current})",
  跳过此版本: "Skip This Version",
  "下载更新（{size}）": "Download Update ({size})",
  "下载中…": "Downloading…",
  下载失败: "Download failed",
  "新版本已下载并打开，把 GitBranches 拖到“应用程序”替换旧版本，然后重新打开应用。":
    "The new version is downloaded and opened. Drag GitBranches into Applications to replace the old one, then reopen the app.",
  再次打开安装包: "Open Installer Again",

  // 弹窗
  知道了: "OK",
  取消: "Cancel",
  确定: "OK",
};
