'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'info';

/** An optional single affordance on a toast — in practice, "Undo". */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_TTL_MS = 4000;
const ACTION_TOAST_TTL_MS = 8000;

/** `toast('Saved')` — fire-and-forget notifications, stacked bottom-center. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = 'info', action?: ToastAction) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, tone, message, action }]);
    // An actionable toast is a decision, not a notification — give it longer to
    // be read and clicked before it disappears.
    setTimeout(
      () => setItems((list) => list.filter((t) => t.id !== id)),
      action ? ACTION_TOAST_TTL_MS : TOAST_TTL_MS,
    );
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`} role="status">
            <span>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
