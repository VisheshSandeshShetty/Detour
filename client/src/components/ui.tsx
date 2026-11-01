// Small building blocks used on many pages: spinner, error banner, empty state, skeleton.

import { AlertTriangle, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Spinner({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-muted ${className}`} role="status">
      <Loader2 className="h-4 w-4 animate-spin text-forest-700" />
      {label && <span>{label}</span>}
    </div>
  );
}

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  tone?: 'error' | 'warning';
}

export function ErrorBanner({ message, onRetry, tone = 'error' }: ErrorBannerProps) {
  const colors =
    tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm ${colors}`} role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 leading-snug">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Grey placeholder cards shown while a list is loading
export function CardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card flex gap-3 p-3">
          <div className="skeleton h-24 w-24 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
