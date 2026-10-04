import React from 'react';
import { useCrm } from '../../context/CrmContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useCrm();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(toast => {
        const bgColors = {
          success: 'bg-emerald-600 text-white dark:bg-emerald-700',
          info: 'bg-indigo-600 text-white dark:bg-indigo-700',
          warning: 'bg-amber-600 text-white dark:bg-amber-700',
          error: 'bg-rose-600 text-white dark:bg-rose-700',
        }[toast.type];

        const icons = {
          success: 'check_circle',
          info: 'info',
          warning: 'warning',
          error: 'error',
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl shadow-xl flex items-start gap-2.5 transition-all transform animate-in slide-in-from-bottom-3 duration-200 ${bgColors}`}
          >
            <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">{icons}</span>
            <div className="flex-1 text-xs">
              <p className="font-bold text-sm leading-tight">{toast.title}</p>
              {toast.message && <p className="mt-1 opacity-90 leading-snug">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/80 hover:text-white shrink-0 p-0.5"
              aria-label="Fechar"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
