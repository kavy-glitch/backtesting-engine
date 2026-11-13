import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role='tab'], [role='button'], select, summary, label[for], input[type='checkbox'], input[type='radio'], input[type='range'], .row-fx";
const TEXT_FIELD = "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='button']):not([type='submit']), textarea";

const mq = (q: string) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;
const reducedMotion = () => mq("(prefers-reduced-motion: reduce)");
const finePointer = () => mq("(hover: hover) and (pointer: fine)");

/**
 * Mouse-driven effects for the whole app, all done with plain DOM + CSS variables (no extra libraries):
 *  - a soft glow and a trailing ring that follow the cursor and grow over clickable things
 *  - a lit-up dot grid and spotlight on cards that follow the pointer
 *  - 3D tilt on elements marked data-tilt
 *  - a ripple + particle burst on every click, and a ripple inside buttons
 * It does nothing on touch devices, and the moving parts switch off if the user prefers reduced motion.
 */
export function CursorFX() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fine = finePointer();
    if (!fine && /jsdom/i.test(navigator.userAgent)) return;
    const root = document.documentElement;
    const calm = reducedMotion();
    if (fine) root.classList.add("fx-on");

    let x = window.innerWidth / 2, y = window.innerHeight / 2; // real pointer
    let rx = x, ry = y; // ring (eased)
    let raf = 0, tilted: HTMLElement | null = null, magnet: HTMLElement | null = null, seen = false;

    const setMode = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null;
      const r = ring.current;
      if (!r) return;
      const tag = el?.closest<HTMLElement>("[data-cursor]")?.dataset.cursor;
      if (label.current) label.current.textContent = tag ?? "";
      r.dataset.mode = !el ? "idle" : tag ? "label" : el.closest(TEXT_FIELD) ? "text" : el.closest(INTERACTIVE) ? "link" : "idle";
    };

    const loop = () => {
      rx += (x - rx) * (calm ? 1 : 0.18);
      ry += (y - ry) * (calm ? 1 : 0.18);
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`;
      raf = requestAnimationFrame(loop);
    };

    const resetTilt = () => {
      if (!tilted) return;
      tilted.style.setProperty("--rx", "0deg"); tilted.style.setProperty("--ry", "0deg"); tilted.style.setProperty("--lift", "0px");
      tilted = null;
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!seen) { seen = true; rx = x; ry = y; root.classList.add("fx-seen"); }
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      root.style.setProperty("--px", `${x}px`); root.style.setProperty("--py", `${y}px`);
      root.style.setProperty("--nx", ((x / window.innerWidth) * 2 - 1).toFixed(3)); root.style.setProperty("--ny", ((y / window.innerHeight) * 2 - 1).toFixed(3));
      setMode(e.target);
      const t = e.target instanceof Element ? e.target : null;
      const card = t?.closest<HTMLElement>(".card, .fx-glow");
      if (card) {
        const b = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${x - b.left}px`); card.style.setProperty("--my", `${y - b.top}px`);
      }
      const tilt = calm ? null : t?.closest<HTMLElement>("[data-tilt]");
      if (tilted && tilted !== tilt) resetTilt();
      const mag = calm ? null : t?.closest<HTMLElement>("[data-magnetic]");
      if (magnet && magnet !== mag) resetMagnet();
      if (mag) {
        const b = mag.getBoundingClientRect();
        mag.style.transform = `translate(${((x - (b.left + b.width / 2)) * 0.22).toFixed(1)}px,${((y - (b.top + b.height / 2)) * 0.3).toFixed(1)}px)`;
        magnet = mag;
      }
      if (tilt) {
        const b = tilt.getBoundingClientRect();
        const px = (x - b.left) / b.width - 0.5, py = (y - b.top) / b.height - 0.5;
        tilt.style.setProperty("--ry", `${(px * 10).toFixed(2)}deg`); tilt.style.setProperty("--rx", `${(-py * 10).toFixed(2)}deg`); tilt.style.setProperty("--lift", "-3px");
        tilted = tilt;
      }
    };

    const resetMagnet = () => { if (magnet) { magnet.style.transform = ""; magnet = null; } };
    const burst = (cx: number, cy: number) => {
      const l = layer.current;
      if (!l) return;
      const ripple = document.createElement("span");
      ripple.className = "fx-ripple";
      ripple.style.left = `${cx}px`; ripple.style.top = `${cy}px`;
      l.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
      if (calm) return;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const p = document.createElement("span");
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.6, d = 26 + Math.random() * 30;
        p.className = "fx-particle";
        p.style.left = `${cx}px`; p.style.top = `${cy}px`;
        p.style.setProperty("--dx", `${Math.cos(a) * d}px`); p.style.setProperty("--dy", `${Math.sin(a) * d}px`);
        p.style.setProperty("--s", `${3 + Math.random() * 3}px`);
        l.appendChild(p);
        setTimeout(() => p.remove(), 700);
      }
    };

    const onDown = (e: PointerEvent) => {
      root.classList.add("fx-played");
      ring.current?.classList.add("is-down");
      const t = e.target instanceof Element ? e.target : null;
      const btn = t?.closest<HTMLElement>(".btn-fx");
      if (btn && !(btn as HTMLButtonElement).disabled) {
        const b = btn.getBoundingClientRect();
        const s = document.createElement("span");
        const size = Math.max(b.width, b.height) * 2;
        s.className = "btn-ripple";
        s.style.width = s.style.height = `${size}px`;
        s.style.left = `${e.clientX - b.left - size / 2}px`; s.style.top = `${e.clientY - b.top - size / 2}px`;
        btn.appendChild(s);
        setTimeout(() => s.remove(), 650);
      }
      burst(e.clientX, e.clientY);
    };
    const onUp = () => ring.current?.classList.remove("is-down");
    const onLeaveWindow = () => { root.classList.remove("fx-seen"); seen = false; resetTilt(); resetMagnet(); };

    if (!fine) {
      // touch screens: no cursor, but every tap still ripples, bursts and gives a tiny buzz
      root.classList.add("fx-touch");
      const tap = (e: PointerEvent) => { root.classList.add("fx-played"); burst(e.clientX, e.clientY); try { navigator.vibrate?.(8); } catch { /* not supported */ } };
      window.addEventListener("pointerdown", tap, { passive: true });
      return () => { window.removeEventListener("pointerdown", tap); root.classList.remove("fx-touch"); };
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeaveWindow);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeaveWindow);
      root.classList.remove("fx-on", "fx-seen");
    };
  }, []);

  return (
    <>
      <div ref={layer} className="fx-layer" aria-hidden />
      <div ref={ring} className="fx-ring" data-mode="idle" aria-hidden><span ref={label} className="fx-label" /></div>
      <div ref={dot} className="fx-dot" aria-hidden />
    </>
  );
}

/** Thin bar under the top of the page that fills as you scroll. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty("--sy", String(Math.round(window.scrollY)));
      if (bar.current) bar.current.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return <div className="fx-progress" aria-hidden><div ref={bar} /></div>;
}

/**
 * Particle world behind the app. Move the pointer to push particles away, press to send out a shockwave,
 * and HOLD to pull them into a swirling well. Works with a finger on touch screens too.
 */
function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || reducedMotion() || /jsdom/i.test(navigator.userAgent)) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0, px = -9999, py = -9999, down = false, frame = 0;
    const trail: { x: number; y: number }[] = [];
    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let ps: P[] = [];
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 16000));
      ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: 1 + Math.random() * 1.6 }));
    };
    const shock = (x: number, y: number) => ps.forEach((p) => { const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1; if (d < 280) { const f = (1 - d / 280) * 10; p.vx += (dx / d) * f; p.vy += (dy / d) * f; } });
    const move = (e: PointerEvent) => { px = e.clientX; py = e.clientY; trail.push({ x: px, y: py }); if (trail.length > 26) trail.shift(); };
    const press = (e: PointerEvent) => { down = true; px = e.clientX; py = e.clientY; shock(px, py); };
    const release = () => { down = false; };
    const leave = () => { px = py = -9999; down = false; };
    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement);
      const a = cs.getPropertyValue("--primary").trim(), b = cs.getPropertyValue("--accent").trim();
      for (const p of ps) {
        const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) || 1;
        if (down && d < 320) { const k = 1 - d / 320; p.vx += (dx / d) * 0.5 * k - (dy / d) * 0.25 * k; p.vy += (dy / d) * 0.5 * k + (dx / d) * 0.25 * k; }
        else if (d < 150) { const k = 1 - d / 150; p.vx -= (dx / d) * 0.12 * k; p.vy -= (dy / d) * 0.12 * k; }
        p.vx *= 0.985; p.vy *= 0.985;
        const sp = Math.hypot(p.vx, p.vy); if (sp > 7) { p.vx *= 7 / sp; p.vy *= 7 / sp; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        for (let j = i + 1; j < ps.length; j++) {
          const q = ps[j], d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 110) { ctx.globalAlpha = (1 - d / 110) * 0.28; ctx.strokeStyle = a; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
        const dp = Math.hypot(p.x - px, p.y - py);
        if (dp < 170) { ctx.globalAlpha = (1 - dp / 170) * 0.6; ctx.strokeStyle = b; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(px, py); ctx.stroke(); }
        ctx.globalAlpha = 0.75; ctx.fillStyle = i % 3 ? a : b; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      // glowing comet tail that follows the pointer and melts away when it stops
      if (++frame % 2 === 0 && trail.length) trail.shift();
      for (let i = 1; i < trail.length; i++) {
        const k = i / trail.length;
        ctx.globalAlpha = k * 0.75; ctx.strokeStyle = k > 0.6 ? b : a; ctx.lineWidth = 0.5 + k * 3.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
      ctx.lineCap = "butt"; ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(loop); };
    resize(); raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize); window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true }); window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release); document.addEventListener("pointerleave", leave); document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); document.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return <canvas ref={ref} className="fx-particles" aria-hidden />;
}

/** Small hint that fades away after the first click or tap. */
export function PlayHint() {
  return <div className="fx-hint tag-mono" aria-hidden><span className="fx-hint-mouse">Move · click · hold to play</span><span className="fx-hint-touch">Tap · hold to play</span></div>;
}

/** Fades and lifts each section of the page in as you scroll down to it. */
export function useScrollReveal(key: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || reducedMotion() || /jsdom/i.test(navigator.userAgent)) return;
    const main = document.querySelector("main");
    if (!main) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target as HTMLElement;
      el.classList.add("in"); io.unobserve(el);
      setTimeout(() => { el.style.transitionDelay = ""; }, 1000);
    }), { threshold: 0.06, rootMargin: "0px 0px -5% 0px" });
    let n = 0;
    const arm = () => main.querySelectorAll<HTMLElement>(":scope > * > *:not(.reveal)").forEach((el) => {
      el.classList.add("reveal"); el.style.transitionDelay = `${Math.min(n++, 4) * 70}ms`; io.observe(el);
    });
    arm();
    const mo = new MutationObserver(() => { n = 0; arm(); });
    mo.observe(main, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [key]);
}

/** Soft floating colour blobs and an interactive dot grid behind everything. */
export function Backdrop() {
  return (
    <div className="fx-backdrop" aria-hidden>
      <span className="fx-blob fx-blob-a" /><span className="fx-blob fx-blob-b" /><span className="fx-blob fx-blob-c" />
      <div className="fx-grid" /><div className="fx-grid fx-grid-lit" /><ParticleField />
    </div>
  );
}
