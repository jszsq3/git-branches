import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { t, useLocale } from "../lib/i18n";

export type PromptOptions = {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 附带一个复选框，如“创建后检出” */
  checkbox?: { label: string; checked: boolean };
  validate?: (value: string) => string | null;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
};

export type MenuItem =
  | { label: string; onSelect: () => void; isDisabled?: boolean; isDanger?: boolean }
  | "separator";

type DialogsValue = {
  alert: (title: string, message: string) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<{ value: string; checked: boolean } | null>;
  menu: (event: ReactMouseEvent, items: MenuItem[]) => void;
};

type Modal =
  | { kind: "alert"; title: string; message: string; resolve: () => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (r: { value: string; checked: boolean } | null) => void };

const DialogsContext = createContext<DialogsValue | null>(null);

export function DialogsProvider({ children }: { children: ReactNode }) {
  // 切换语言时重绘弹窗按钮
  useLocale();
  const [modal, setModal] = useState<Modal | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const alert = useCallback(
    (title: string, message: string) => new Promise<void>(resolve => setModal({ kind: "alert", title, message, resolve })),
    [],
  );
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setModal({ kind: "confirm", options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<{ value: string; checked: boolean } | null>(resolve => setModal({ kind: "prompt", options, resolve })),
    [],
  );
  const openMenu = useCallback((event: ReactMouseEvent, items: MenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items });
  }, []);

  const value = useMemo(() => ({ alert, confirm, prompt, menu: openMenu }), [alert, confirm, prompt, openMenu]);
  const close = () => setModal(null);

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {modal?.kind === "alert" && (
        <ModalFrame
          title={modal.title}
          onCancel={() => {
            close();
            modal.resolve();
          }}
        >
          <pre className="modal-message">{modal.message}</pre>
          <div className="modal-actions">
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                close();
                modal.resolve();
              }}
            >
              {t("知道了")}
            </button>
          </div>
        </ModalFrame>
      )}
      {modal?.kind === "confirm" && (
        <ModalFrame
          title={modal.options.title}
          onCancel={() => {
            close();
            modal.resolve(false);
          }}
        >
          <p className="modal-message">{modal.options.message}</p>
          <div className="modal-actions">
            <button
              className="btn"
              onClick={() => {
                close();
                modal.resolve(false);
              }}
            >
              {t("取消")}
            </button>
            <button
              className={`btn ${modal.options.isDanger ? "danger" : "primary"}`}
              autoFocus
              onClick={() => {
                close();
                modal.resolve(true);
              }}
            >
              {modal.options.confirmLabel ?? t("确定")}
            </button>
          </div>
        </ModalFrame>
      )}
      {modal?.kind === "prompt" && (
        <PromptModal
          options={modal.options}
          onDone={result => {
            close();
            modal.resolve(result);
          }}
        />
      )}
    </DialogsContext.Provider>
  );
}

function ModalFrame({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function PromptModal({
  options,
  onDone,
}: {
  options: PromptOptions;
  onDone: (r: { value: string; checked: boolean } | null) => void;
}) {
  const [value, setValue] = useState(options.initial ?? "");
  const [checked, setChecked] = useState(options.checkbox?.checked ?? false);
  const error = value.trim() ? (options.validate?.(value.trim()) ?? null) : null;
  const submit = () => {
    if (!value.trim() || error) return;
    onDone({ value: value.trim(), checked });
  };
  return (
    <ModalFrame title={options.title} onCancel={() => onDone(null)}>
      <form
        className="modal-form"
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
      >
        {options.label && <label className="field-label">{options.label}</label>}
        <input
          className="input"
          autoFocus
          value={value}
          placeholder={options.placeholder}
          onChange={e => setValue(e.target.value)}
          spellCheck={false}
        />
        {error && <div className="field-error">{error}</div>}
        {options.checkbox && (
          <label className="checkbox">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            {options.checkbox.label}
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => onDone(null)}>
            {t("取消")}
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim() || Boolean(error)}>
            {options.confirmLabel ?? t("确定")}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      // 贴边时往回收，菜单不出窗口
      const r = el.getBoundingClientRect();
      setPos({
        x: Math.min(x, window.innerWidth - r.width - 4),
        y: Math.min(y, window.innerHeight - r.height - 4),
      });
    }
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [x, y, onClose]);
  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} onMouseDown={e => e.stopPropagation()}>
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            className={`menu-item${item.isDanger ? " danger" : ""}`}
            disabled={item.isDisabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function useDialogs(): DialogsValue {
  const value = useContext(DialogsContext);
  if (!value) throw new Error("useDialogs 必须在 DialogsProvider 内使用");
  return value;
}
