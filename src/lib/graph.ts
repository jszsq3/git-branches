import type { Commit } from "./repo";

/** 一段线：从 (from, fromY) 到 (to, toY)，列为泳道序号，y 取 0=行顶、0.5=节点、1=行底。 */
export type Segment = { from: number; fromY: number; to: number; toY: number; color: number };

export type GraphRow = {
  col: number;
  color: number;
  segments: Segment[];
  /** 本行用到的列数，用于计算图宽 */
  width: number;
};

/**
 * 按提交顺序（子在前）分配泳道：每条泳道记着它下一个期待的提交。
 * 泳道不压缩，路过的线保持竖直；空出的泳道留给后来的分支复用。
 */
export function layoutGraph(commits: Commit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let nextColor = 0;
  const rows: GraphRow[] = [];

  const openLane = (sha: string) => {
    let i = lanes.indexOf(null);
    if (i === -1) i = lanes.length;
    lanes[i] = sha;
    colors[i] = nextColor++;
    return i;
  };

  for (const c of commits) {
    let col = lanes.indexOf(c.sha);
    // 没有泳道期待它：分支的最新提交，从节点起笔
    const isTip = col === -1;
    if (isTip) col = openLane(c.sha);
    const color = colors[col] ?? 0;
    const segments: Segment[] = [];

    // 行顶：期待本提交的泳道汇入节点，其余泳道直穿
    lanes.forEach((sha, i) => {
      if (sha === null) return;
      const laneColor = colors[i] ?? 0;
      if (sha !== c.sha) {
        segments.push({ from: i, fromY: 0, to: i, toY: 1, color: laneColor });
        return;
      }
      if (!(i === col && isTip)) segments.push({ from: i, fromY: 0, to: col, toY: 0.5, color: laneColor });
      if (i !== col) lanes[i] = null;
    });

    // 行底：第一个父提交沿用本泳道，其余父提交接到已有泳道或新开泳道
    const [first, ...rest] = c.parents;
    if (first === undefined) {
      lanes[col] = null;
    } else {
      const existing = lanes.indexOf(first);
      if (existing !== -1 && existing !== col) {
        lanes[col] = null;
        segments.push({ from: col, fromY: 0.5, to: existing, toY: 1, color: colors[existing] ?? 0 });
      } else {
        lanes[col] = first;
        segments.push({ from: col, fromY: 0.5, to: col, toY: 1, color });
      }
    }
    for (const p of rest) {
      let lane = lanes.indexOf(p);
      if (lane === -1) lane = openLane(p);
      segments.push({ from: col, fromY: 0.5, to: lane, toY: 1, color: colors[lane] ?? 0 });
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();

    let width = col + 1;
    for (const s of segments) width = Math.max(width, s.from + 1, s.to + 1);
    rows.push({ col, color, segments, width });
  }
  return rows;
}
