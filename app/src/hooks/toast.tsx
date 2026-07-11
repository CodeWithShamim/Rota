import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, ttlMs?: number) => number;
  update: (id: number, kind: ToastKind, message: string, ttlMs?: number) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, ttlMs?: number) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      if (ttlMs) timers.current.set(id, setTimeout(() => dismiss(id), ttlMs));
    },
    [dismiss]
  );

  const push = useCallback(
    (kind: ToastKind, message: string, ttlMs?: number) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, kind, message }]);
      schedule(id, ttlMs);
      return id;
    },
    [schedule]
  );

  const update = useCallback(
    (id: number, kind: ToastKind, message: string, ttlMs?: number) => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, kind, message } : t)));
      schedule(id, ttlMs);
    },
    [schedule]
  );

  const api = useMemo(() => ({ toasts, push, update, dismiss }), [toasts, push, update, dismiss]);
  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
