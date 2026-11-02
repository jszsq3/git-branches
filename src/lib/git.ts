import { invoke } from "@tauri-apps/api/core";

import { t } from "./i18n";

export type GitOutput = { code: number; stdout: string; stderr: string };

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly output: GitOutput,
  ) {
    super((output.stderr || output.stdout).trim() || t("git {cmd} 退出码 {code}", { cmd: args[0] ?? "", code: output.code }));
  }
}

/** 执行 git，不论退出码都返回输出。 */
export function runGit(cwd: string, args: string[], stdin?: string): Promise<GitOutput> {
  return invoke<GitOutput>("git", { cwd, args, stdin: stdin ?? null });
}

/** 执行 git，退出码非 0 时抛出 GitError。 */
export async function git(cwd: string, args: string[], stdin?: string): Promise<string> {
  const out = await runGit(cwd, args, stdin);
  if (out.code !== 0) throw new GitError(args, out);
  return out.stdout;
}

export const SEP = "\x1f";
export const REC = "\x1e";
