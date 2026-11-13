import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, CornerDownLeft, Database, GitCompare, History, LayoutDashboard, Layers, Moon, Play, Search, Sun } from "lucide-react";
import { useTheme } from "../../lib/hooks";
import { cx } from "../ui";

const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ boot screen
const BOOT_LINES = ["loading interface", "preparing charts", "warming up the market field", "ready to test strategies"];
const BOOT_KEY = "pbe-booted";

/** Short cinematic loading screen shown once per browser session. Click Skip, press Enter or Esc to leave early. */
export function BootScreen() {
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem(BOOT_KEY) && !reduced(); } catch { return false; } });
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const done = useCallback(() => {
    try { sessionStorage.setItem(BOOT_KEY, "1"); } catch { /* storage unavailable */ }
    setLeaving(true);
    setTimeout(() => setShow(false), 650);
  }, []);
  useEffect(() => {
    if (!show) return;
    const start = performance.now(), total = 2300;
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / total);
      setPct(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      if (t >= 1) { clearInterval(id); setTimeout(done, 250); }
    }, 40);
    const key = (e: KeyboardEvent) => (e.key === "Enter" || e.key === "Escape") && done();
    window.addEventListener("keydown", key);
    return () => { clearInterval(id); window.removeEventListener("keydown", key); };
  }, [show, done]);
  if (!show) return null;
  const lines = Math.min(BOOT_LINES.length, Math.floor(pct / 25) + 1);
  return (
    <div className={cx("boot", leaving && "boot-out")} role="status" aria-label="Loading">
      <div className="boot-inner">
        <div className="boot-mark"><BarChart3 className="h-7 w-7" aria-hidden /></div>
        <h1 className="boot-title">BACKTESTING<span>ENGINE</span></h1>
        <ul className="boot-log">{BOOT_LINES.slice(0, lines).map((l, i) => <li key={l} className={i === lines - 1 && pct < 100 ? "" : "ok"}>&gt; {l}</li>)}</ul>
        <div className="boot-bar" aria-hidden><div style={{ width: `${pct}%` }} /></div>
        <div className="boot-meta num"><span>LOADING ASSETS… {pct}%</span><button onClick={done}>Skip</button></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ command palette
export const openPalette = () => window.dispatchEvent(new Event("pbe:palette"));

/** Ctrl/⌘ + K: jump to any page or run a quick action from the keyboard. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo(() => [
    { label: "Overview", hint: "Dashboard", icon: LayoutDashboard, run: () => nav("/") },
    { label: "New backtest", hint: "Run a strategy", icon: Play, run: () => nav("/backtest") },
    { label: "Compare strategies", hint: "Side by side", icon: GitCompare, run: () => nav("/compare") },
    { label: "Strategies", hint: "Built-in and saved", icon: Layers, run: () => nav("/strategies") },
    { label: "History", hint: "Saved runs", icon: History, run: () => nav("/history") },
    { label: "Market data", hint: "Import prices", icon: Database, run: () => nav("/data") },
    { label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", hint: "Appearance", icon: theme === "dark" ? Sun : Moon, run: toggle },
  ], [nav, theme, toggle]);
  const shown = items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q.trim().toLowerCase()));

  const close = useCallback(() => { setOpen(false); setQ(""); setSel(0); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    const ext = () => setOpen(true);
    window.addEventListener("keydown", key); window.addEventListener("pbe:palette", ext);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pbe:palette", ext); };
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  if (!open) return null;
  const choose = (i: number) => { const it = shown[i]; if (it) { close(); it.run(); } };
  return (
    <div className="modal-backdrop fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="card modal-card w-full max-w-lg overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
        }}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Type a page or action…" aria-label="Search commands"
            className="!border-0 !shadow-none w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
          <kbd className="tag-mono rounded border border-line px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-2" role="listbox">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>}
          {shown.map((it, i) => (
            <li key={it.label} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => choose(i)}
              className={cx("row-fx flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm", i === sel ? "bg-primary-soft text-primary" : "text-ink")}>
              <it.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="font-semibold">{it.label}</span>
              <span className="ml-auto text-xs text-muted">{it.hint}</span>{i === sel && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small helpers
/** Counts up from 0 to `value` when it first appears. */
export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [n, setN] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setN(value); return; }
    let raf = 0; const t0 = performance.now(), d = 1300;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / d); setN(value * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(n)}</>;
}

/** Elapsed session time, like the film-reel timecode on the reference site. */
export function useTimecode() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

/** Animated price lines that bend away from the cursor. Decorative only. */
export function MarketField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || /jsdom/i.test(navigator.userAgent)) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const calm = reduced();
    let w = 0, h = 0, raf = 0, mx = -999, my = -999, t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // fixed pseudo-random walks so the picture is the same every visit
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const LINES = 6, PTS = 90;
    const walks = Array.from({ length: LINES }, () => { let v = 0; return Array.from({ length: PTS }, () => (v += (rnd() - 0.48) * 0.5)); });
    const resize = () => { const r = c.getBoundingClientRect(); w = r.width; h = r.height; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const move = (e: PointerEvent) => { const r = c.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement);
      const cols = [cs.getPropertyValue("--primary").trim(), cs.getPropertyValue("--accent").trim()];
      walks.forEach((wk, li) => {
        const base = h * (0.25 + (li / LINES) * 0.6), amp = h * 0.05;
        ctx.beginPath();
        for (let i = 0; i < PTS; i++) {
          const x = (i / (PTS - 1)) * w;
          let y = base + (wk[(i + Math.floor(t * 4)) % PTS] - wk[0]) * amp;
          const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy);
          if (d < 140) y += (dy / (d || 1)) * (1 - d / 140) * 36; // push the line away from the pointer
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = cols[li % 2]; ctx.globalAlpha = 0.16 + (li / LINES) * 0.3; ctx.lineWidth = 1.6; ctx.stroke();
      });
      ctx.globalAlpha = 1; t += 0.012;
      if (!calm) raf = requestAnimationFrame(draw);
    };
    resize(); draw();
    window.addEventListener("resize", resize); window.addEventListener("pointermove", move, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); };
  }, []);
  return <canvas ref={ref} aria-hidden className={cx("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}

// ------------------------------------------------------------------ scroll + hover showpieces
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/\\[]{}=+*#";
/** Text that scrambles into place when it first appears and again whenever you hover it. */
export function Scramble({ text, delay = 0 }: { text: string; delay?: number }) {
  const [out, setOut] = useState(text);
  const raf = useRef(0);
  const run = useCallback(() => {
    if (reduced() || /jsdom/i.test(navigator.userAgent)) return;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now(), dur = 650;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), settled = Math.floor(p * text.length);
      setOut(text.split("").map((ch, i) => (ch === " " || i < settled ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(""));
      if (p < 1) raf.current = requestAnimationFrame(step); else setOut(text);
    };
    raf.current = requestAnimationFrame(step);
  }, [text]);
  useEffect(() => { const id = setTimeout(run, delay); return () => { clearTimeout(id); cancelAnimationFrame(raf.current); }; }, [run, delay]);
  return <span aria-label={text} onMouseEnter={run}>{out}</span>;
}

/** Huge outlined text strip. It scrolls sideways on its own, speeds up and skews while you scroll, and flips direction with the scroll. */
export function Marquee({ items }: { items: string[] }) {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el || reduced() || /jsdom/i.test(navigator.userAgent)) return;
    let x = 0, dir = -1, last = window.scrollY, vel = 0, skew = 0, raf = 0;
    const loop = () => {
      const d = window.scrollY - last; last = window.scrollY;
      vel += (Math.abs(d) - vel) * 0.12;
      if (d !== 0) dir = d > 0 ? -1 : 1;
      skew += (Math.max(-14, Math.min(14, -d * 0.5)) - skew) * 0.15;
      x += dir * (0.7 + vel * 0.6);
      const half = el.scrollWidth / 2;
      if (x <= -half) x += half; else if (x > 0) x -= half;
      el.style.transform = `translate3d(${x}px,0,0) skewX(${skew.toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const row = items.map((t, i) => <span key={t} className={cx("marquee-item", i % 2 ? "is-fill" : "")}>{t}<b aria-hidden>✦</b></span>);
  return <div className="marquee" aria-hidden><div ref={track} className="marquee-track">{row}{row}</div></div>;
}

/** Dots down the right edge: shows which section you are in, click one to glide there. */
export function SceneRail({ scenes }: { scenes: { id: string; label: string }[] }) {
  const [active, setActive] = useState(scenes[0]?.id);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-45% 0px -50% 0px" });
    scenes.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [scenes]);
  if (typeof IntersectionObserver === "undefined") return null;
  return (
    <nav className="rail" aria-label="Sections on this page">
      {scenes.map((s, i) => (
        <button key={s.id} className={cx("rail-dot", active === s.id && "is-on")} aria-label={s.label} aria-current={active === s.id || undefined}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" })}>
          <span className="tag-mono">{String(i + 1).padStart(2, "0")} {s.label}</span><i />
        </button>
      ))}
    </nav>
  );
}
