export type DiffLine =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; text: string; old?: number; new?: number }
  | { kind: "meta"; text: string };

/** 解析单个文件的 unified diff，丢掉 diff/index/---/+++ 头。 */
export function parseDiff(text: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      oldNo = Number(m?.[1] ?? 0);
      newNo = Number(m?.[2] ?? 0);
      inHunk = true;
      lines.push({ kind: "hunk", text: raw });
      continue;
    }
    if (!inHunk) {
      if (raw.startsWith("Binary files")) lines.push({ kind: "meta", text: "二进制文件，不显示差异" });
      else if (raw.startsWith("similarity index")) lines.push({ kind: "meta", text: `相似度 ${raw.slice(17)}` });
      continue;
    }
    if (raw.startsWith("+")) lines.push({ kind: "add", text: raw.slice(1), new: newNo++ });
    else if (raw.startsWith("-")) lines.push({ kind: "del", text: raw.slice(1), old: oldNo++ });
    else if (raw.startsWith(" ")) lines.push({ kind: "ctx", text: raw.slice(1), old: oldNo++, new: newNo++ });
    else if (raw.startsWith("\\")) lines.push({ kind: "meta", text: "文件末尾没有换行" });
  }
  return lines;
}
