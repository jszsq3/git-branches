import { t } from "./i18n";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff >= 0 && diff < 60_000) return t("刚刚");
  if (diff >= 0 && diff < 3_600_000) return t("{n} 分钟前", { n: Math.floor(diff / 60_000) });
  if (diff >= 0 && diff < 86_400_000) return t("{n} 小时前", { n: Math.floor(diff / 3_600_000) });
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFullDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "A":
      return t("新增");
    case "M":
      return t("修改");
    case "D":
      return t("已删除");
    case "R":
      return t("已重命名");
    case "C":
      return t("已复制");
    case "T":
      return t("类型变更");
    case "U":
      return t("冲突");
    case "?":
      return t("未跟踪");
    default:
      return status;
  }
}
