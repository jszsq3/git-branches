import { useCallback } from "react";

import type { Ref } from "../lib/repo";
import type { MenuItem } from "./dialogs";
import { useDialogs } from "./dialogs";
import { useRepo } from "./repo-context";

export function invalidBranchName(name: string): string | null {
  if (/\s/.test(name)) return "不能包含空白";
  if (/[~^:?*[\\]|\.\.|@\{|\/\/|\/$|^\/|^-|\.lock$|\.$/.test(name)) return "不是合法的分支名";
  return null;
}

const remoteOf = (ref: Ref) => ref.name.slice(0, ref.name.indexOf("/"));
const remoteBranchOf = (ref: Ref) => ref.name.slice(ref.name.indexOf("/") + 1);

export type BranchActions = ReturnType<typeof useBranchActions>;

/** 分支相关操作，以及右键菜单的组成。 */
export function useBranchActions(onCompare: (ref: Ref) => void) {
  const { refs, head, remotes, favorites, run, toggleFavorite } = useRepo();
  const dialogs = useDialogs();
  const localNames = refs.filter(r => r.kind === "local").map(r => r.name);

  const validateNew = useCallback(
    (name: string) => invalidBranchName(name) ?? (localNames.includes(name) ? "本地已有同名分支" : null),
    [localNames],
  );

  const checkout = useCallback(
    async (ref: Ref) => {
      if (ref.kind === "local") return run(`检出 ${ref.name}`, ["switch", ref.name]);
      if (ref.kind === "tag") return run(`检出 ${ref.name}`, ["switch", "--detach", ref.name]);
      const local = remoteBranchOf(ref);
      if (localNames.includes(local)) {
        const ok = await dialogs.confirm({
          title: "本地已有同名分支",
          message: `本地已有 ${local}，将直接检出它，不会改成跟踪 ${ref.name}。`,
          confirmLabel: `检出 ${local}`,
        });
        return ok && run(`检出 ${local}`, ["switch", local]);
      }
      return run(`检出 ${local}`, ["switch", "--track", "-c", local, ref.name]);
    },
    [run, dialogs, localNames],
  );

  const newBranch = useCallback(
    async (base: string, suggested = "") => {
      const r = await dialogs.prompt({
        title: `从 ${base} 新建分支`,
        label: "分支名",
        initial: suggested,
        confirmLabel: "创建",
        checkbox: { label: "创建后检出", checked: true },
        validate: validateNew,
      });
      if (!r) return false;
      return r.checked
        ? run(`新建 ${r.value}`, ["switch", "-c", r.value, base])
        : run(`新建 ${r.value}`, ["branch", r.value, base]);
    },
    [dialogs, run, validateNew],
  );

  const merge = useCallback(
    async (ref: Ref) => {
      const ok = await dialogs.confirm({
        title: "合并",
        message: `把 ${ref.name} 合并到 ${head.branch || "当前 HEAD"}？有冲突时会停在合并中，解决后在“提交”页继续。`,
        confirmLabel: "合并",
      });
      return ok && run(`合并 ${ref.name}`, ["merge", "--no-edit", ref.name]);
    },
    [dialogs, run, head.branch],
  );

  const rebase = useCallback(
    async (ref: Ref) => {
      const ok = await dialogs.confirm({
        title: "变基",
        message: `把 ${head.branch || "当前 HEAD"} 变基到 ${ref.name} 之上？会改写当前分支未推送的提交。`,
        confirmLabel: "变基",
      });
      return ok && run(`变基到 ${ref.name}`, ["rebase", ref.name]);
    },
    [dialogs, run, head.branch],
  );

  const push = useCallback(
    async (ref: Ref, isForce = false) => {
      const remote = ref.upstream ? ref.upstream.slice(0, ref.upstream.indexOf("/")) : remotes.includes("origin") ? "origin" : remotes[0];
      if (!remote) {
        await dialogs.alert("无法推送", "这个仓库没有配置远端。");
        return false;
      }
      if (isForce) {
        const ok = await dialogs.confirm({
          title: "强制推送",
          message: `用 --force-with-lease 把 ${ref.name} 推送到 ${remote}，远端上别人新推的提交会让推送失败而不是被覆盖。`,
          confirmLabel: "强制推送",
          isDanger: true,
        });
        if (!ok) return false;
      }
      const target = ref.upstream ? `${ref.name}:${ref.upstream.slice(remote.length + 1)}` : ref.name;
      const args = ["push", ...(isForce ? ["--force-with-lease"] : []), ...(ref.upstream ? [] : ["-u"]), remote, target];
      return run(`推送 ${ref.name}`, args);
    },
    [remotes, dialogs, run],
  );

  const rename = useCallback(
    async (ref: Ref) => {
      const r = await dialogs.prompt({
        title: `重命名 ${ref.name}`,
        label: "新名称",
        initial: ref.name,
        confirmLabel: "重命名",
        validate: name => (name === ref.name ? "名称没有变化" : validateNew(name)),
      });
      return r ? run(`重命名 ${ref.name}`, ["branch", "-m", ref.name, r.value]) : false;
    },
    [dialogs, run, validateNew],
  );

  const remove = useCallback(
    async (ref: Ref) => {
      if (ref.kind === "remote") {
        const ok = await dialogs.confirm({
          title: "删除远端分支",
          message: `从 ${remoteOf(ref)} 删除 ${remoteBranchOf(ref)}？对所有人生效。`,
          confirmLabel: "删除远端分支",
          isDanger: true,
        });
        return ok && run(`删除 ${ref.name}`, ["push", remoteOf(ref), "--delete", remoteBranchOf(ref)]);
      }
      if (ref.kind === "tag") {
        const ok = await dialogs.confirm({
          title: "删除标签",
          message: `删除本地标签 ${ref.name}？远端标签不受影响。`,
          confirmLabel: "删除",
          isDanger: true,
        });
        return ok && run(`删除标签 ${ref.name}`, ["tag", "-d", ref.name]);
      }
      const ok = await dialogs.confirm({
        title: "删除分支",
        message: `删除本地分支 ${ref.name}？`,
        confirmLabel: "删除",
        isDanger: true,
      });
      if (!ok) return false;
      if (await run(`删除 ${ref.name}`, ["branch", "-d", ref.name], { quiet: true })) return true;
      const force = await dialogs.confirm({
        title: "分支未完全合并",
        message: `${ref.name} 上有尚未合并到上游或当前分支的提交。强制删除后，这些提交只能通过 reflog 找回。`,
        confirmLabel: "强制删除",
        isDanger: true,
      });
      return force && run(`强制删除 ${ref.name}`, ["branch", "-D", ref.name]);
    },
    [dialogs, run],
  );

  const pull = useCallback(async () => {
    if (await run("拉取", ["pull", "--ff-only"], { quiet: true })) return true;
    const ok = await dialogs.confirm({
      title: "无法快进",
      message: "本地和远端都有新提交，不能直接快进。要用合并的方式拉取吗？也可以取消后自己变基。",
      confirmLabel: "合并拉取",
    });
    return ok && run("拉取", ["pull", "--no-rebase", "--no-edit"]);
  }, [run, dialogs]);

  const menuFor = useCallback(
    (ref: Ref): MenuItem[] => {
      const isHead = ref.kind === "local" && ref.name === head.branch;
      const current = head.branch || "HEAD";
      const items: MenuItem[] = [];
      if (!isHead) items.push({ label: ref.kind === "tag" ? "检出（游离 HEAD）" : "检出", onSelect: () => void checkout(ref) });
      items.push({ label: `从 ${ref.name} 新建分支…`, onSelect: () => void newBranch(ref.name) });
      if (isHead) {
        items.push({ label: "拉取", onSelect: () => void pull(), isDisabled: !ref.upstream });
      } else {
        items.push("separator");
        items.push({ label: `与 ${current} 比较`, onSelect: () => onCompare(ref) });
        items.push({ label: `将 ${ref.name} 合并到 ${current}`, onSelect: () => void merge(ref) });
        items.push({ label: `将 ${current} 变基到 ${ref.name}`, onSelect: () => void rebase(ref) });
      }
      if (ref.kind === "local") {
        items.push("separator");
        items.push({ label: ref.upstream ? "推送" : "推送并设置上游", onSelect: () => void push(ref) });
        items.push({ label: "强制推送…", onSelect: () => void push(ref, true), isDisabled: !ref.upstream });
        items.push({ label: "重命名…", onSelect: () => void rename(ref) });
      }
      if (ref.kind !== "tag") {
        items.push("separator");
        items.push({
          label: favorites.includes(ref.name) ? "取消收藏" : "收藏",
          onSelect: () => toggleFavorite(ref.name),
        });
      }
      if (!isHead) {
        items.push("separator");
        items.push({
          label: ref.kind === "remote" ? "删除远端分支…" : ref.kind === "tag" ? "删除标签…" : "删除…",
          onSelect: () => void remove(ref),
          isDanger: true,
        });
      }
      return items;
    },
    [head.branch, favorites, checkout, newBranch, pull, merge, rebase, push, rename, remove, toggleFavorite, onCompare],
  );

  return { checkout, newBranch, merge, rebase, push, rename, remove, pull, menuFor };
}
