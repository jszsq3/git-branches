import { useCallback } from "react";

import { t } from "../lib/i18n";
import type { Ref } from "../lib/repo";
import type { MenuItem } from "./dialogs";
import { useDialogs } from "./dialogs";
import { useRepo } from "./repo-context";

export function invalidBranchName(name: string): string | null {
  if (/\s/.test(name)) return t("不能包含空白");
  if (/[~^:?*[\\]|\.\.|@\{|\/\/|\/$|^\/|^-|\.lock$|\.$/.test(name)) return t("不是合法的分支名");
  return null;
}

const remoteOf = (ref: Ref) => ref.name.slice(0, ref.name.indexOf("/"));
const remoteBranchOf = (ref: Ref) => ref.name.slice(ref.name.indexOf("/") + 1);

/** 上游 `origin/feat-x` 拆成远端名和远端上的分支名 */
function splitUpstream(upstream: string, remotes: string[]): { remote: string; branch: string } {
  // 远端名可能含 `/`，取最长匹配
  const remote = [...remotes].sort((a, b) => b.length - a.length).find(r => upstream.startsWith(`${r}/`)) ?? upstream.slice(0, upstream.indexOf("/"));
  return { remote, branch: upstream.slice(remote.length + 1) };
}

export type BranchActions = ReturnType<typeof useBranchActions>;

/** 分支相关操作，以及右键菜单的组成。 */
export function useBranchActions(onCompare: (ref: Ref) => void) {
  const { refs, head, remotes, favorites, run, toggleFavorite } = useRepo();
  const dialogs = useDialogs();
  const localNames = refs.filter(r => r.kind === "local").map(r => r.name);

  const validateNew = useCallback(
    (name: string) => invalidBranchName(name) ?? (localNames.includes(name) ? t("本地已有同名分支") : null),
    [localNames],
  );

  const checkout = useCallback(
    async (ref: Ref) => {
      if (ref.kind === "local") return run(t("检出 {name}", { name: ref.name }), ["switch", ref.name]);
      if (ref.kind === "tag") return run(t("检出 {name}", { name: ref.name }), ["switch", "--detach", ref.name]);
      const local = remoteBranchOf(ref);
      if (localNames.includes(local)) {
        const ok = await dialogs.confirm({
          title: t("本地已有同名分支"),
          message: t("本地已有 {local}，将直接检出它，不会改成跟踪 {remote}。", { local, remote: ref.name }),
          confirmLabel: t("检出 {name}", { name: local }),
        });
        return ok && run(t("检出 {name}", { name: local }), ["switch", local]);
      }
      return run(t("检出 {name}", { name: local }), ["switch", "--track", "-c", local, ref.name]);
    },
    [run, dialogs, localNames],
  );

  const newBranch = useCallback(
    async (base: string, suggested = "") => {
      const r = await dialogs.prompt({
        title: t("从 {base} 新建分支", { base }),
        label: t("分支名"),
        initial: suggested,
        confirmLabel: t("创建"),
        checkbox: { label: t("创建后检出"), checked: true },
        validate: validateNew,
      });
      if (!r) return false;
      const label = t("新建 {name}", { name: r.value });
      return r.checked ? run(label, ["switch", "-c", r.value, base]) : run(label, ["branch", r.value, base]);
    },
    [dialogs, run, validateNew],
  );

  const merge = useCallback(
    async (ref: Ref) => {
      const ok = await dialogs.confirm({
        title: t("合并"),
        message: t("把 {source} 合并到 {target}？有冲突时会停在合并中，解决后在“提交”页继续。", {
          source: ref.name,
          target: head.branch || t("当前 HEAD"),
        }),
        confirmLabel: t("合并"),
      });
      return ok && run(t("合并 {name}", { name: ref.name }), ["merge", "--no-edit", ref.name]);
    },
    [dialogs, run, head.branch],
  );

  const rebase = useCallback(
    async (ref: Ref) => {
      const ok = await dialogs.confirm({
        title: t("变基"),
        message: t("把 {current} 变基到 {onto} 之上？会改写当前分支未推送的提交。", {
          current: head.branch || t("当前 HEAD"),
          onto: ref.name,
        }),
        confirmLabel: t("变基"),
      });
      return ok && run(t("变基到 {name}", { name: ref.name }), ["rebase", ref.name]);
    },
    [dialogs, run, head.branch],
  );

  const push = useCallback(
    async (ref: Ref, isForce = false) => {
      const up = ref.upstream ? splitUpstream(ref.upstream, remotes) : null;
      const remote = up?.remote ?? (remotes.includes("origin") ? "origin" : remotes[0]);
      if (!remote) {
        await dialogs.alert(t("无法推送"), t("这个仓库没有配置远端。"));
        return false;
      }
      if (isForce) {
        const ok = await dialogs.confirm({
          title: t("强制推送"),
          message: t("用 --force-with-lease 把 {name} 推送到 {remote}，远端上别人新推的提交会让推送失败而不是被覆盖。", {
            name: ref.name,
            remote,
          }),
          confirmLabel: t("强制推送"),
          isDanger: true,
        });
        if (!ok) return false;
      }
      const target = up ? `${ref.name}:${up.branch}` : ref.name;
      const args = ["push", ...(isForce ? ["--force-with-lease"] : []), ...(up ? [] : ["-u"]), remote, target];
      return run(t("推送 {name}", { name: ref.name }), args);
    },
    [remotes, dialogs, run],
  );

  const rename = useCallback(
    async (ref: Ref) => {
      const r = await dialogs.prompt({
        title: t("重命名 {name}", { name: ref.name }),
        label: t("新名称"),
        initial: ref.name,
        confirmLabel: t("重命名"),
        validate: name => (name === ref.name ? t("名称没有变化") : validateNew(name)),
      });
      return r ? run(t("重命名 {name}", { name: ref.name }), ["branch", "-m", ref.name, r.value]) : false;
    },
    [dialogs, run, validateNew],
  );

  const remove = useCallback(
    async (ref: Ref) => {
      if (ref.kind === "remote") {
        const ok = await dialogs.confirm({
          title: t("删除远端分支"),
          message: t("从 {remote} 删除 {branch}？对所有人生效。", { remote: remoteOf(ref), branch: remoteBranchOf(ref) }),
          confirmLabel: t("删除远端分支"),
          isDanger: true,
        });
        return ok && run(t("删除 {name}", { name: ref.name }), ["push", remoteOf(ref), "--delete", remoteBranchOf(ref)]);
      }
      if (ref.kind === "tag") {
        const ok = await dialogs.confirm({
          title: t("删除标签"),
          message: t("删除本地标签 {name}？远端标签不受影响。", { name: ref.name }),
          confirmLabel: t("删除"),
          isDanger: true,
        });
        return ok && run(t("删除标签 {name}", { name: ref.name }), ["tag", "-d", ref.name]);
      }
      const ok = await dialogs.confirm({
        title: t("删除分支"),
        message: t("删除本地分支 {name}？", { name: ref.name }),
        confirmLabel: t("删除"),
        isDanger: true,
      });
      if (!ok) return false;
      if (await run(t("删除 {name}", { name: ref.name }), ["branch", "-d", ref.name], { quiet: true })) return true;
      const force = await dialogs.confirm({
        title: t("分支未完全合并"),
        message: t("{name} 上有尚未合并到上游或当前分支的提交。强制删除后，这些提交只能通过 reflog 找回。", { name: ref.name }),
        confirmLabel: t("强制删除"),
        isDanger: true,
      });
      return force && run(t("强制删除 {name}", { name: ref.name }), ["branch", "-D", ref.name]);
    },
    [dialogs, run],
  );

  const pull = useCallback(async () => {
    if (await run(t("拉取"), ["pull", "--ff-only"], { quiet: true })) return true;
    const ok = await dialogs.confirm({
      title: t("无法快进"),
      message: t("本地和远端都有新提交，不能直接快进。要用合并的方式拉取吗？也可以取消后自己变基。"),
      confirmLabel: t("合并拉取"),
    });
    return ok && run(t("拉取"), ["pull", "--no-rebase", "--no-edit"]);
  }, [run, dialogs]);

  /**
   * 把本地分支更新到上游的最新提交：当前分支走拉取；
   * 其他分支用 `fetch <远端> <远端分支>:<本地分支>`，只在能快进时更新，不用先检出。
   */
  const update = useCallback(
    async (ref: Ref) => {
      if (ref.kind !== "local" || !ref.upstream) return false;
      if (ref.name === head.branch) return pull();
      const { remote, branch } = splitUpstream(ref.upstream, remotes);
      return run(t("更新 {name}", { name: ref.name }), ["fetch", remote, `${branch}:${ref.name}`], {
        hint: t("只有能快进时才会更新。如果 {name} 和 {upstream} 各有对方没有的提交（git 提示 non-fast-forward），请检出 {name} 后用合并或变基处理。", {
          name: ref.name,
          upstream: ref.upstream,
        }),
      });
    },
    [head.branch, remotes, run, pull],
  );

  /** 只更新某个远端分支的远端跟踪引用 */
  const fetchRemoteBranch = useCallback(
    (ref: Ref) => run(t("获取 {name}", { name: ref.name }), ["fetch", remoteOf(ref), remoteBranchOf(ref)]),
    [run],
  );

  const menuFor = useCallback(
    (ref: Ref): MenuItem[] => {
      const isHead = ref.kind === "local" && ref.name === head.branch;
      const current = head.branch || "HEAD";
      const items: MenuItem[] = [];
      if (!isHead) {
        items.push({ label: ref.kind === "tag" ? t("检出（游离 HEAD）") : t("检出"), onSelect: () => void checkout(ref) });
      }
      items.push({ label: t("从 {name} 新建分支…", { name: ref.name }), onSelect: () => void newBranch(ref.name) });
      if (ref.kind === "local") {
        const behind = ref.behind > 0 ? t("（落后 {n}）", { n: ref.behind }) : "";
        items.push({
          label: ref.upstream
            ? `${t("更新：获取并快进到 {upstream}", { upstream: ref.upstream })}${behind}`
            : t("更新（没有上游分支）"),
          onSelect: () => void update(ref),
          isDisabled: !ref.upstream,
        });
      }
      if (ref.kind === "remote") {
        items.push({ label: t("获取 {name} 的最新提交", { name: ref.name }), onSelect: () => void fetchRemoteBranch(ref) });
      }
      if (!isHead) {
        items.push("separator");
        items.push({ label: t("与 {current} 比较", { current }), onSelect: () => onCompare(ref) });
        items.push({ label: t("将 {name} 合并到 {current}", { name: ref.name, current }), onSelect: () => void merge(ref) });
        items.push({ label: t("将 {current} 变基到 {name}", { name: ref.name, current }), onSelect: () => void rebase(ref) });
      }
      if (ref.kind === "local") {
        items.push("separator");
        items.push({ label: ref.upstream ? t("推送") : t("推送并设置上游"), onSelect: () => void push(ref) });
        items.push({ label: t("强制推送…"), onSelect: () => void push(ref, true), isDisabled: !ref.upstream });
        items.push({ label: t("重命名…"), onSelect: () => void rename(ref) });
      }
      if (ref.kind !== "tag") {
        items.push("separator");
        items.push({
          label: favorites.includes(ref.name) ? t("取消收藏") : t("收藏"),
          onSelect: () => toggleFavorite(ref.name),
        });
      }
      if (!isHead) {
        items.push("separator");
        items.push({
          label: ref.kind === "remote" ? t("删除远端分支…") : ref.kind === "tag" ? t("删除标签…") : t("删除…"),
          onSelect: () => void remove(ref),
          isDanger: true,
        });
      }
      return items;
    },
    [head.branch, favorites, checkout, newBranch, update, fetchRemoteBranch, merge, rebase, push, rename, remove, toggleFavorite, onCompare],
  );

  return { checkout, newBranch, merge, rebase, push, rename, remove, pull, update, menuFor };
}
