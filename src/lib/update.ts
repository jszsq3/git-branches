import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

import { t } from "./i18n";

/** 发布渠道，与版本管理后台的“渠道”一致 */
const CHANNEL = "stable";
const SKIP_KEY = "update:skip";

export type Release = {
  version: string;
  channel: string;
  notes: string;
  published_at: string;
  file_name: string;
  size: number;
  url: string;
};

export type UpdateCheck = { current: string; latest: Release | null; isNewer: boolean };

type Execution = { status?: string; responseStatusCode?: number; responseBody?: string; errors?: string };
type UpdateBody = { latest?: Release | null; is_newer?: boolean };

/** 向版本管理查询最新版本；版本比较由服务端完成 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = await getVersion();
  const raw = await invoke<string>("check_update", { current, channel: CHANNEL });
  const execution = JSON.parse(raw) as Execution;
  if (execution.status !== "completed" || execution.responseStatusCode !== 200 || !execution.responseBody) {
    throw new Error(execution.errors || t("更新服务返回异常（{status}）", { status: String(execution.responseStatusCode ?? execution.status) }));
  }
  const body = JSON.parse(execution.responseBody) as UpdateBody;
  const latest = body.latest ?? null;
  return { current, latest, isNewer: Boolean(body.is_newer && latest && latest.version !== current) };
}

/** 下载到“下载”文件夹，返回保存路径 */
export function downloadUpdate(release: Release): Promise<string> {
  return invoke<string>("download_update", { url: release.url, fileName: release.file_name });
}

export function skippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

export function skipVersion(version: string) {
  try {
    localStorage.setItem(SKIP_KEY, version);
  } catch {
    // 记不住时下次启动还会提示
  }
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
