import { useCallback, useEffect, useRef } from "react";
import { BarChart3 } from "lucide-react";

const jsdom = () => /jsdom/i.test(navigator.userAgent);
const calm = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The cover is skipped in tests and for people who ask their system for reduced motion. */
export const coverEligible = () => typeof window !== "undefined" && !jsdom() && !calm();

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const UP = "#1ec99a", DOWN = "#ff6369", ACCENT = "#8b9bff";

const Letters = ({ text, base }: { text: string; base: number }) => (
  <span className="cv-word" aria-label={text}>
    {text.split("").map((ch, i) => <span key={i} aria-hidden className="cv-letter" style={{ animationDelay: `${(base + i * 0.045).toFixed(3)}s` }}>{ch}</span>)}
  </span>
);

/**
 * Full-screen intro. Scroll, swipe or press the arrow keys to fly through a tunnel of candlesticks;
 * when you reach the end it dissolves into the app. Hold the mouse/finger down to warp. Scrolling up
 * from the top of the Overview page brings it back.
 */
export function Cover({ startAt = 0, onDone }: { startAt?: number; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const s0 = useRef<HTMLDivElement>(null), s1 = useRef<HTMLDivElement>(null), s2 = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null), pctEl = useRef<HTMLSpanElement>(null), tcEl = useRef<HTMLSpanElement>(null);
  const scEl = useRef<HTMLSpanElement>(null), cue = useRef<HTMLDivElement>(null), enter = useRef<HTMLDivElement>(null);
  const exiting = useRef(false);
  const bootDelay = useRef((() => { try { return sessionStorage.getItem("pbe-booted") ? 0 : 2.7; } catch { return 0; } })()).current;

  const exit = useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    root.current?.classList.add("cv-exit");
    const html = document.documentElement;
    html.classList.add("arrive");
    setTimeout(() => html.classList.remove("arrive"), 1400);
    setTimeout(onDone, 900);
  }, [onDone]);

  useEffect(() => {
    const cv = canvas.current, ctx = cv?.getContext("2d");
    if (!cv || !ctx) { onDone(); return; }
    const html = document.documentElement;
    html.classList.add("cover-open");
    const born = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, target = startAt, prog = startAt, warp = 0, travel = 0, down = false, mx = 0, my = 0, ty = 0, lastTc = -1;
    const resize = () => { w = window.innerWidth; h = window.innerHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();

    // the world: candlesticks arranged around a tunnel, reused as you fly forward
    const DEPTH = 3400;
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const candles = Array.from({ length: 300 }, () => {
      const a = rnd() * Math.PI * 2, R = 230 + Math.pow(rnd(), 0.7) * 820, b = 18 + rnd() * 46;
      return { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.62, z: rnd() * DEPTH, w: 10 + rnd() * 14, b, wick: b * (0.5 + rnd()), up: rnd() > 0.42 };
    });

    const live = () => performance.now() - born > bootDelay * 1000 && !exiting.current;
    const push = (d: number) => { if (live()) target = clamp(target + d); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); push(e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.00085); };
    const tStart = (e: TouchEvent) => { ty = e.touches[0].clientY; };
    const tMove = (e: TouchEvent) => { e.preventDefault(); const y = e.touches[0].clientY; push((ty - y) * 0.0034); ty = y; };
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); push(0.14); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); push(-0.14); }
      else if (e.key === "End") push(1);
      else if (e.key === "Escape" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))) exit();
    };
    const move = (e: PointerEvent) => { mx = (e.clientX / w - 0.5) * 2; my = (e.clientY / h - 0.5) * 2; };
    const press = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest("button"))) down = true; };
    const release = () => { down = false; };
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchstart", tStart, { passive: true });
    window.addEventListener("touchmove", tMove, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    window.addEventListener("resize", resize);

    const place = (el: HTMLElement | null, o: number, scale: number) => {
      if (!el) return;
      el.style.opacity = o.toFixed(3); el.style.visibility = o < 0.01 ? "hidden" : "visible";
      el.style.transform = `translate3d(${(mx * -16).toFixed(1)}px,${(my * -10).toFixed(1)}px,0) scale(${scale.toFixed(3)})`;
      el.style.filter = o < 0.98 ? `blur(${((1 - o) * 12).toFixed(1)}px)` : "none";
    };

    const loop = (now: number) => {
      const t = Math.max(0, (now - born) / 1000 - bootDelay);
      prog += (target - prog) * 0.075; warp += ((down ? 1 : 0) - warp) * 0.06;
      travel += 0.9 + warp * 26;
      const p = prog, camZ = p * 2800 + travel, camX = mx * 110, camY = my * 70;
      const cx = w / 2, cy = h / 2, F = Math.min(w, h) * 0.62;

      ctx.fillStyle = "#04070b"; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
      g.addColorStop(0, `rgba(30,201,154,${0.16 + warp * 0.18 + p * 0.08})`); g.addColorStop(1, "rgba(4,7,11,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // checkpoint rings
      ctx.strokeStyle = UP;
      for (let k = 0; k < DEPTH / 420; k++) {
        const zr = (((k * 420 - camZ) % DEPTH) + DEPTH) % DEPTH; if (zr < 50) continue;
        const s = F / zr; ctx.globalAlpha = (1 - zr / DEPTH) * 0.3; ctx.lineWidth = 1 + s * 2;
        ctx.beginPath(); ctx.ellipse(cx - camX * s, cy - camY * s, 520 * s, 330 * s, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // glowing equity curve through the middle of the tunnel
      for (const [lw, al] of [[8, 0.12], [2.4, 0.9]] as const) {
        ctx.beginPath(); ctx.strokeStyle = ACCENT; ctx.lineWidth = lw; ctx.globalAlpha = al;
        for (let z = DEPTH; z > 60; z -= 50) {
          const wz = z + camZ, s = F / z, sx = cx + (Math.sin(wz * 0.0034) * 190 - camX) * s, sy = cy + (Math.cos(wz * 0.0026) * 120 - camY) * s;
          z === DEPTH ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      // candles, far to near
      const vis = candles.map((c) => ({ c, zr: (((c.z - camZ) % DEPTH) + DEPTH) % DEPTH })).filter((o) => o.zr > 30).sort((a, b) => b.zr - a.zr);
      for (const { c, zr } of vis) {
        const s = F / zr, sx = cx + (c.x - camX) * s, sy = cy + (c.y - camY) * s;
        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
        const a = Math.pow(1 - zr / DEPTH, 1.2) * clamp((zr - 60) / 220), bw = c.w * s, bh = c.b * s, col = c.up ? UP : DOWN;
        ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * 2.2);
        if (warp > 0.12) { const s2 = F / (zr + warp * 320); ctx.globalAlpha = a * warp * 0.7; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx + (c.x - camX) * s2, cy + (c.y - camY) * s2); ctx.stroke(); ctx.globalAlpha = a; }
        ctx.beginPath(); ctx.moveTo(sx, sy - bh / 2 - c.wick * s); ctx.lineTo(sx, sy + bh / 2 + c.wick * s * 0.7); ctx.stroke();
        ctx.fillRect(sx - bw / 2, sy - bh / 2, bw, bh);
      }
      ctx.globalAlpha = 1;

      // scenes: text you fly through as you scroll
      const intro = ease(clamp(t / 1.3)), out0 = ease(clamp((p - 0.14) / 0.17));
      place(s0.current, (1 - out0) * intro, (0.8 + 0.2 * intro) + out0 * 1.7);
      const in1 = ease(clamp((p - 0.3) / 0.1)), out1 = ease(clamp((p - 0.6) / 0.1));
      place(s1.current, in1 * (1 - out1), 0.5 + 0.5 * in1 + out1 * 1.7);
      const in2 = ease(clamp((p - 0.68) / 0.1));
      place(s2.current, in2, 0.55 + 0.45 * in2);
      if (enter.current) { const o = ease(clamp((p - 0.86) / 0.1)); enter.current.style.opacity = String(o); enter.current.style.pointerEvents = o > 0.5 ? "auto" : "none"; }
      if (cue.current) cue.current.style.opacity = String(intro * (1 - ease(clamp((p - 0.82) / 0.1))));
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`;
      if (pctEl.current) pctEl.current.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (scEl.current) scEl.current.textContent = `SC.0${p < 0.33 ? 1 : p < 0.66 ? 2 : 3}/03`;
      const sec = Math.floor(t);
      if (tcEl.current && sec !== lastTc) { lastTc = sec; tcEl.current.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }

      if (target >= 0.999 && p > 0.985) { exit(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); html.classList.remove("cover-open");
      window.removeEventListener("wheel", wheel); window.removeEventListener("touchstart", tStart); window.removeEventListener("touchmove", tMove);
      window.removeEventListener("keydown", key); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = bootDelay;
  return (
    <div ref={root} className="cv" role="dialog" aria-label="Introduction. Scroll to continue.">
      <canvas ref={canvas} className="cv-canvas" aria-hidden />
      <div className="cv-vignette" aria-hidden />
      <header className="cv-top">
        <div className="cv-brand"><span><BarChart3 className="h-4 w-4" aria-hidden /></span>Backtesting Engine</div>
        <div className="cv-hud tag-mono"><span ref={scEl}>SC.01/03</span><span ref={tcEl}>00:00</span><button onClick={exit} className="cv-skip">Skip intro</button></div>
      </header>

      <div className="cv-stage">
        <div ref={s0} className="cv-scene" style={{ opacity: 0 }}>
          <div className="tag-mono cv-kicker" style={{ animationDelay: `${d + 0.1}s` }}>[ 00 / COVER ] · SVNIT Surat · Mathematics &amp; Computing</div>
          <h1 className="cv-title"><Letters text="BACKTESTING" base={d + 0.2} /><Letters text="ENGINE" base={d + 0.65} /></h1>
          <p className="cv-sub" style={{ animationDelay: `${d + 1.3}s` }}>Test trading strategies on real market history.</p>
        </div>
        <div ref={s1} className="cv-scene" style={{ opacity: 0, visibility: "hidden" }}>
          <h2 className="cv-big">REPLAY<em>THE PAST.</em></h2>
          <p className="cv-sub">Fees, slippage and next-bar execution. No look-ahead, no shortcuts.</p>
        </div>
        <div ref={s2} className="cv-scene" style={{ opacity: 0, visibility: "hidden" }}>
          <h2 className="cv-big">TRUST<em>THE DATA.</em></h2>
          <p className="cv-sub">Five strategies · a C++ engine · every run saved in MySQL.</p>
        </div>
      </div>

      <div ref={enter} className="cv-enter" style={{ opacity: 0, pointerEvents: "none" }}>
        <button onClick={exit} data-cursor="Enter" className="btn-fx btn-primary cv-enter-btn">Enter the engine</button>
      </div>

      <div ref={cue} className="cv-bottom" style={{ opacity: 0 }}>
        <div className="tag-mono cv-pct"><span ref={pctEl}>000</span>%</div>
        <div className="cv-cue tag-mono"><i className="cv-mouse" aria-hidden />Scroll to continue</div>
        <div className="tag-mono cv-hold">Hold to warp</div>
      </div>
      <div className="cv-progress" aria-hidden><div ref={bar} /></div>
    </div>
  );
}
