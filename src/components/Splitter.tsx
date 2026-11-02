import { useCallback, useState } from "react";

/** 可拖动的分隔条；`invert` 表示拖动方向与尺寸增长方向相反（如右侧面板）。 */
export function useSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(`size:${key}`));
      return saved >= min && saved <= max ? saved : initial;
    } catch {
      return initial;
    }
  });
  const save = useCallback(
    (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      setSize(clamped);
      try {
        localStorage.setItem(`size:${key}`, String(clamped));
      } catch {
        // 忽略
      }
    },
    [key, min, max],
  );
  return [size, save] as const;
}

export function Splitter({
  axis,
  size,
  onSize,
  invert = false,
}: {
  axis: "x" | "y";
  size: number;
  onSize: (v: number) => void;
  invert?: boolean;
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const start = axis === "x" ? e.clientX : e.clientY;
    const startSize = size;
    const move = (ev: MouseEvent) => {
      const delta = (axis === "x" ? ev.clientX : ev.clientY) - start;
      onSize(startSize + (invert ? -delta : delta));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("dragging");
    };
    document.body.classList.add("dragging");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return <div className={`splitter ${axis}`} onMouseDown={onMouseDown} />;
}
