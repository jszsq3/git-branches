const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff >= 0 && diff < 60_000) return "刚刚";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFullDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const STATUS_LABEL: Record<string, string> = {
  A: "新增",
  M: "修改",
  D: "删除",
  R: "重命名",
  C: "复制",
  T: "类型变更",
  U: "冲突",
  "?": "未跟踪",
};
