import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Command, Database, GitCompare, History, LayoutDashboard, Layers, Menu, Moon, Sun, X } from "lucide-react";
import { api } from "../../api/client";
import { useAsync, useTheme } from "../../lib/hooks";
import { Toaster, cx } from "../ui";
import { Backdrop, CursorFX, PlayHint, ScrollProgress, useScrollReveal } from "../effects/Effects";
import { CommandPalette, openPalette, useTimecode } from "../effects/Cinematic";
import { Cover, coverEligible } from "../effects/Cover";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/backtest", label: "Backtest", icon: BarChart3 },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/strategies", label: "Strategies", icon: Layers },
  { to: "/history", label: "History", icon: History },
  { to: "/data", label: "Market data", icon: Database },
];

function StatusPill() {
  const { data, error, loading } = useAsync(() => api.health(), []);
  const ok = data?.status === "ok";
  const label = loading ? "Checking…" : error ? "API offline" : ok ? "All systems ready" : `Degraded: ${data?.database !== "ok" ? "database" : "engine"}`;
  return (
    <span className="num inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted" title={data?.engine_version ? `Engine v${data.engine_version}` : undefined}>
      <span className={cx("h-2 w-2 rounded-full", !loading && ok && "status-dot text-up", loading ? "bg-muted" : ok ? "bg-up" : "bg-down")} aria-hidden />{label}
    </span>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const timecode = useTimecode();
  useScrollReveal(pathname);
  const first = useRef(true);
  const [wipe, setWipe] = useState(0);
  useEffect(() => { if (first.current) { first.current = false; return; } setWipe((n) => n + 1); }, [pathname]);
  // the cover plays when the app opens on the Overview page; pulling up at the very top of Overview brings it back
  const [cover, setCover] = useState<number | null>(() => (pathname === "/" && coverEligible() ? 0 : null));
  useEffect(() => {
    if (cover !== null || pathname !== "/" || !coverEligible()) return;
    let pull = 0, timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (window.scrollY > 0 || e.deltaY >= 0) { pull = 0; return; }
      pull -= e.deltaY; clearTimeout(timer); timer = window.setTimeout(() => { pull = 0; }, 350);
      if (pull > 420) { pull = 0; setCover(0.9); }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => { window.removeEventListener("wheel", onWheel); clearTimeout(timer); };
  }, [cover, pathname]);
  const sceneIdx = Math.max(0, NAV.findIndex((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))));
  const links = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => cx("nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", isActive ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-ink")}>
          <Icon className="h-5 w-5" aria-hidden />{label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-full">
      <Backdrop /><ScrollProgress /><CursorFX /><CommandPalette /><PlayHint />{cover !== null && <Cover startAt={cover} onDone={() => setCover(null)} />}{wipe > 0 && <div key={wipe} className="wipe" aria-hidden />}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4 lg:flex">
        <Brand />{links}
        <p className="mt-auto text-[11px] leading-snug text-muted">Educational tool. Backtests are simulations on historical data and do not predict future results.</p>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 space-y-6 bg-surface p-4">
            <div className="flex items-center justify-between"><Brand /><button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2"><X className="h-5 w-5" /></button></div>
            {links}
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur">
          <button className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="font-bold lg:hidden">Backtesting Engine</span>
          <div className="hud num hidden items-center gap-3 md:flex" aria-hidden>
            <span className="hud-dot" /><span>SC.{String(sceneIdx + 1).padStart(2, "0")}</span><span className="text-muted">NOW SHOWING —</span><span key={pathname} className="hud-scene">{NAV[sceneIdx].label.toUpperCase()}</span><span className="text-muted">{timecode}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={openPalette} aria-label="Open command palette" className="hidden items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink sm:inline-flex">
              <Command className="h-3.5 w-3.5" aria-hidden />Quick jump<kbd className="tag-mono rounded border border-line px-1.5 py-0.5">Ctrl K</kbd>
            </button>
            <StatusPill />
            <button onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} className="rounded-xl border border-line p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <span key={theme} className="theme-spin block">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</span>
            </button>
          </div>
        </header>
        <main key={pathname} className="page-enter mx-auto w-full max-w-[1500px] p-4 sm:p-6"><Outlet /></main>
      </div>
      <Toaster />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-[var(--primary-contrast)]"><BarChart3 className="h-5 w-5" aria-hidden /></div>
      <div className="leading-tight"><div className="text-sm font-extrabold">Backtesting</div><div className="text-[11px] font-semibold text-muted">Portfolio Engine</div></div>
    </div>
  );
}
