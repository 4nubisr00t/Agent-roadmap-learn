import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IconCheck, IconClose, IconLightning } from './Icons.js';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const useFeedback = (): FeedbackContextValue => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }
  return ctx;
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, variant, message }]);
      timersRef.current[id] = setTimeout(() => {
        dismissToast(id);
      }, variant === 'error' ? 5000 : 3500);
    },
    [dismissToast]
  );

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const normalized: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options: normalized, resolve });
    });
  }, []);

  const handleConfirmChoice = useCallback(
    (accepted: boolean) => {
      if (!confirmState) return;
      const resolver = confirmState.resolve;
      setConfirmState(null);
      resolver(accepted);
    },
    [confirmState]
  );

  useEffect(() => {
    if (!confirmState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleConfirmChoice(false);
      } else if (e.key === 'Enter') {
        handleConfirmChoice(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmState, handleConfirmChoice]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const toast = {
    success: (message: string) => pushToast('success', message),
    error: (message: string) => pushToast('error', message),
    info: (message: string) => pushToast('info', message),
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Floating Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[130] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
          {toasts.map((item) => {
            const palette =
              item.variant === 'success'
                ? 'border-emerald-500/45 bg-zinc-950/95 text-emerald-200 shadow-emerald-500/10'
                : item.variant === 'error'
                  ? 'border-rose-500/50 bg-zinc-950/95 text-rose-200 shadow-rose-500/10'
                  : 'border-amber-500/45 bg-zinc-950/95 text-amber-200 shadow-amber-500/10';
            const iconBadge =
              item.variant === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : item.variant === 'error'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30';

            return (
              <div
                key={item.id}
                className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl animate-slideUp ${palette}`}
              >
                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBadge}`}>
                  {item.variant === 'success' ? (
                    <IconCheck className="w-3.5 h-3.5" />
                  ) : item.variant === 'error' ? (
                    <IconClose className="w-3.5 h-3.5" />
                  ) : (
                    <IconLightning className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex-1 text-xs font-semibold leading-relaxed whitespace-pre-line">
                  {item.message}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  className="text-zinc-500 hover:text-zinc-200 p-0.5 rounded transition-colors"
                  aria-label="关闭通知"
                >
                  <IconClose className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified Black-Gold Confirm Dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleConfirmChoice(false);
          }}
        >
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-slideUp">
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                  confirmState.options.danger
                    ? 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                    : 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                }`}
              >
                <IconLightning className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-zinc-100">
                  {confirmState.options.title || (confirmState.options.danger ? '确认执行删除操作' : '请确认操作')}
                </h3>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed whitespace-pre-line">
                  {confirmState.options.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-750 rounded-xl transition-all active:scale-95"
              >
                {confirmState.options.cancelText || '取消'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all shadow-md active:scale-95 ${
                  confirmState.options.danger
                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:brightness-105 text-zinc-950 shadow-amber-500/20'
                }`}
              >
                {confirmState.options.confirmText || '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};
