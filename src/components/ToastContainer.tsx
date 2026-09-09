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
        let bg = 'bg-blue-50';
        let border = 'border-blue-200';
        let text = 'text-blue-800';
        let iconColor = 'text-blue-500';

        if (toast.type === 'success') {
          Icon = CheckCircle;
          bg = 'bg-green-50';
          border = 'border-green-200';
          text = 'text-green-800';
          iconColor = 'text-green-500';
        } else if (toast.type === 'error') {
          Icon = AlertCircle;
          bg = 'bg-red-50';
          border = 'border-red-200';
          text = 'text-red-800';
          iconColor = 'text-red-500';
        } else if (toast.type === 'warning') {
          Icon = AlertTriangle;
          bg = 'bg-amber-50';
          border = 'border-amber-200';
          text = 'text-amber-800';
          iconColor = 'text-amber-500';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start p-4 rounded-lg border shadow-sm ${bg} ${border} min-w-[300px] max-w-sm animate-in slide-in-from-right-8 fade-in duration-300`}
          >
            <Icon className={`w-5 h-5 mr-3 shrink-0 mt-0.5 ${iconColor}`} />
            <div className={`flex-1 text-sm font-medium ${text} mr-2 break-words`}>
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className={`shrink-0 ${iconColor} hover:text-gray-900 focus:outline-none`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
