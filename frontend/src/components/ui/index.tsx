import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useToast } from "../../lib/hooks";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Small monospace section label, e.g. "[ 02 / HISTORY ] · saved runs". */
export function SectionTag({ n, name, note }: { n: number; name: string; note?: string }) {
  return <div className="tag-mono mb-1.5"><span className="text-primary">[ {String(n).padStart(2, "0")} / {name.toUpperCase()} ]</span>{note && <> · {note}</>}</div>;
}

// ---------------------------------------------------------------- buttons
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean; icon?: ReactNode };
export function Button({ variant = "primary", busy, icon, children, className, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-primary text-[var(--primary-contrast)] hover:opacity-90",
    secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
    ghost: "text-muted hover:bg-surface-2 hover:text-ink",
    danger: "bg-down text-white hover:opacity-90",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx("btn-fx inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50", variant === "primary" && "btn-primary", styles, className)}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- form fields
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      {children}
      {error ? <p role="alert" className="mt-1 text-xs text-down">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
const inputCls = "w-full rounded-xl border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-accent";
export function Input({ error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input {...rest} aria-invalid={error || undefined} className={cx(inputCls, error ? "border-down" : "border-line", className)} />;
}
export function Select({ error, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return <select {...rest} aria-invalid={error || undefined} className={cx(inputCls, error ? "border-down" : "border-line", className)}>{children}</select>;
}

// ---------------------------------------------------------------- display
export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "up" | "down" | "warn" | "accent"; title?: string }) {
  const t = {
    neutral: "bg-surface-2 text-muted border-line", up: "bg-primary-soft text-up border-transparent", down: "bg-down/10 text-down border-transparent",
    warn: "bg-warn-soft text-warn border-transparent", accent: "bg-accent/10 text-accent border-transparent",
  }[tone];
  return <span title={title} className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", t)}>{children}</span>;
}
export const SyntheticBadge = () => <Badge tone="warn" title="Generated demo data, not real market prices">SYNTHETIC</Badge>;

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="rounded-2xl bg-primary-soft p-3 text-primary">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-2xl bg-down/10 p-3 text-down"><AlertTriangle className="h-6 w-6" aria-hidden /></div>
      <h3 className="text-base font-semibold">Something went wrong</h3>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const t = { info: "bg-accent/10 text-ink", warn: "bg-warn-soft text-ink", error: "bg-down/10 text-ink" }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2 rounded-xl px-3 py-2 text-sm", t)}>
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", tone === "warn" ? "text-warn" : tone === "error" ? "text-down" : "text-accent")} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone, hint }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "flat"; hint?: string }) {
  return (
    <div className="card p-4" data-tilt title={hint}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("num mt-1 truncate text-xl font-bold sm:text-2xl", tone === "up" && "text-up", tone === "down" && "text-down")} data-testid={`stat-${label}`}>{value}</div>
      {sub && <div className="num mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition", value === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cx("card modal-card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-b-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className="card toast-fx pointer-events-auto flex items-start gap-2 p-3 text-sm">
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden /> : t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />}
          <span className="min-w-0 flex-1 break-words">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-bold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
