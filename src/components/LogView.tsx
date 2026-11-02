import { useEffect, useMemo, useRef, useState } from "react";

import { formatDate } from "../lib/format";
import { layoutGraph } from "../lib/graph";
import type { GraphRow } from "../lib/graph";
import { loadLog } from "../lib/repo";
import type { Commit } from "../lib/repo";
import { useRepo } from "../state/repo-context";
import { IconSearch } from "./icons";

const ROW_H = 26;
const LANE_W = 14;
const MAX_LANES = 24;
const PAGE = 800;
const PALETTE = 8;

export type LogScope = {
  /** 传给 git log 的修订；空数组表示全部分支 */
  revs: string[];
  label: string;
};

export function LogView({
  scope,
  selected,
  onSelect,
  onClearScope,
  banner,
}: {
  scope: LogScope;
  selected: string | null;
  onSelect: (c: Commit) => void;
  onClearScope: () => void;
  banner?: JSX.Element | null;
}) {
  const { root, version, head } = useRepo();
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [query, setQuery] = useState({ text: "", author: "" });
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const token = useRef(0);

  // 输入停顿后再查询
  useEffect(() => {
    const t = setTimeout(() => setQuery({ text, author }), 300);
    return () => clearTimeout(t);
  }, [text, author]);

  const revsKey = scope.revs.join("\n");
  useEffect(() => {
    const my = ++token.current;
    setIsLoading(true);
    void loadLog(root, { revs: scope.revs, text: query.text, author: query.author, skip: 0, limit: PAGE }).then(list => {
      if (my !== token.current) return;
      setCommits(list);
      setIsDone(list.length < PAGE);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, revsKey, query, version]);

  // 换范围或条件时回到顶部
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [revsKey, query]);

  const loadMore = () => {
    if (isDone || isLoading) return;
    const my = token.current;
    setIsLoading(true);
    void loadLog(root, { revs: scope.revs, text: query.text, author: query.author, skip: commits.length, limit: PAGE }).then(
      list => {
        if (my !== token.current) return;
        setCommits(c => [...c, ...list]);
        setIsDone(list.length < PAGE);
        setIsLoading(false);
      },
    );
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 按文本或作者过滤时，提交之间不连续，分支图没有意义
  const isFiltered = Boolean(query.text || query.author);
  const graph = useMemo(() => (isFiltered ? [] : layoutGraph(commits)), [commits, isFiltered]);
  const lanes = Math.min(MAX_LANES, graph.reduce((m, r) => Math.max(m, r.width), 1));
  const graphW = isFiltered ? 0 : lanes * LANE_W + 6;

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 10);
  const last = Math.min(commits.length, Math.ceil((scrollTop + viewH) / ROW_H) + 10);

  useEffect(() => {
    if (last >= commits.length - 20) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, commits.length]);

  // 键盘上下切换提交
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = commits.findIndex(c => c.sha === selected);
    const next = commits[Math.max(0, Math.min(commits.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    onSelect(next);
    const el = scroller.current;
    const idx = commits.indexOf(next);
    if (el && (idx * ROW_H < el.scrollTop || (idx + 1) * ROW_H > el.scrollTop + el.clientHeight)) {
      el.scrollTop = idx * ROW_H - el.clientHeight / 2;
    }
  };

  return (
    <div className="log">
      <div className="log-toolbar">
        <label className="search">
          <IconSearch />
          <input value={text} placeholder="提交信息或哈希" onChange={e => setText(e.target.value)} spellCheck={false} />
        </label>
        <input
          className="input small"
          value={author}
          placeholder="作者"
          onChange={e => setAuthor(e.target.value)}
          spellCheck={false}
        />
        <span className="scope-chip">
          分支：{scope.label}
          {scope.revs.length > 0 && (
            <button className="chip-clear" title="显示全部分支" onClick={onClearScope}>
              ×
            </button>
          )}
        </span>
        <span className="muted log-count">
          {isLoading ? "加载中…" : `${commits.length}${isDone ? "" : "+"} 个提交`}
        </span>
      </div>
      {banner}
      <div className="log-scroll" ref={scroller} tabIndex={0} onKeyDown={onKeyDown} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        {commits.length === 0 && !isLoading && <div className="empty">没有符合条件的提交</div>}
        <div style={{ height: commits.length * ROW_H, position: "relative" }}>
          {commits.slice(first, last).map((c, k) => {
            const i = first + k;
            const row = graph[i];
            return (
              <div
                key={c.sha}
                className={`log-row${c.sha === selected ? " selected" : ""}${c.sha === head.sha ? " is-head" : ""}`}
                style={{ top: i * ROW_H }}
                onClick={() => onSelect(c)}
              >
                {graphW > 0 && <GraphCell row={row} width={graphW} />}
                <span className="log-subject">
                  <RefBadges refs={c.refs} />
                  <span className="subject-text">{c.subject}</span>
                </span>
                <span className="log-author" title={c.email}>
                  {c.author}
                </span>
                <span className="log-date">{formatDate(c.date)}</span>
                <span className="log-sha">{c.sha.slice(0, 8)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const laneX = (col: number) => col * LANE_W + LANE_W / 2 + 3;

function GraphCell({ row, width }: { row: GraphRow | undefined; width: number }) {
  if (!row) return <span style={{ width, flex: "none" }} />;
  const visible = (col: number) => col < MAX_LANES;
  return (
    <svg className="graph" width={width} height={ROW_H} aria-hidden="true">
      {row.segments.map((s, i) => {
        if (!visible(s.from) || !visible(s.to)) return null;
        const x1 = laneX(s.from);
        const x2 = laneX(s.to);
        const y1 = s.fromY * ROW_H;
        const y2 = s.toY * ROW_H;
        const d =
          x1 === x2 ? `M${x1} ${y1}L${x2} ${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
        return <path key={i} d={d} className={`lane c${s.color % PALETTE}`} />;
      })}
      {visible(row.col) && <circle cx={laneX(row.col)} cy={ROW_H / 2} r={4} className={`node c${row.color % PALETTE}`} />}
    </svg>
  );
}

export function RefBadges({ refs }: { refs: string[] }) {
  const { refs: known } = useRepo();
  if (refs.length === 0) return null;
  const isLocal = (name: string) => known.some(k => k.kind === "local" && k.name === name);
  return (
    <span className="badges">
      {refs.map(r => {
        if (r === "HEAD") return <span key={r} className="badge head">HEAD</span>;
        if (r.startsWith("HEAD -> ")) {
          return (
            <span key={r} className="badge head">
              {r.slice(8)}
            </span>
          );
        }
        if (r.startsWith("tag: ")) {
          return (
            <span key={r} className="badge tag">
              {r.slice(5)}
            </span>
          );
        }
        return (
          <span key={r} className={`badge ${isLocal(r) ? "local" : "remote"}`}>
            {r}
          </span>
        );
      })}
    </span>
  );
}
