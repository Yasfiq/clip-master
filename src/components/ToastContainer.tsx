'use client';

import React from 'react';
import { useToastStore } from '@/stores/useToastStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = Info;
        let bg = 'bg-zinc-900';
        let border = 'border-sky-800/70';
        let text = 'text-sky-200';
        let iconColor = 'text-sky-400';

        if (toast.type === 'success') {
          Icon = CheckCircle;
          bg = 'bg-zinc-900';
          border = 'border-emerald-800/70';
          text = 'text-emerald-200';
          iconColor = 'text-emerald-400';
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          bg = 'bg-zinc-900';
          border = 'border-rose-800/70';
          text = 'text-rose-200';
          iconColor = 'text-rose-400';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          bg = 'bg-zinc-900';
          border = 'border-amber-800/70';
          text = 'text-amber-200';
          iconColor = 'text-amber-400';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start p-3.5 rounded-xl border shadow-xl ${bg} ${border} min-w-[280px] max-w-sm animate-in slide-in-from-right-8 fade-in duration-300`}
          >
            <Icon className={`w-4 h-4 mr-2.5 shrink-0 mt-0.5 ${iconColor}`} />
            <div className={`flex-1 text-xs font-medium ${text} mr-2 break-words`}>
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 text-zinc-400 hover:text-zinc-100 focus:outline-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
