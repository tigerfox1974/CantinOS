import { useEffect, useRef } from "react";

// Transitions.dev — Spinning counter (TypeScript / React, self-contained)

const STEP = (50 * Math.PI) / 180; // drum angle between two digits
const ENTER_MS = 120; // rest to rolling
const FADE_END = 1.8; // steps from the middle where a digit is gone
const LAND_AT = 0.6; // steps from the middle where the target starts landing
const ARRIVE_AT = 0.29; // share of the spring where it reaches the middle
const CLEAR_MS = 200; // blur + neighbours clearing at the start of the spring

interface Tokens {
  stepDur: number;
  stagger: number;
  ease: (x: number) => number;
  offset: number;
  sideScale: number;
  sideBlur: number;
  sideOpacity: number;
  centerScale: number;
  centerBlur: number;
  anticDur: number;
  anticScale: number;
  anticLift: number;
  landDur: number;
  landPeak: number;
}

interface ColItem {
  cells: HTMLElement[];
  digit: number;
  from: number;
  done?: boolean;
  landAt?: number;
  landFrom?: { angle: number; scale: number; back: number };
}

function token(name: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isNaN(v) ? fallback : v;
}

function length(el: HTMLElement, name: string, fallbackEm: number): number {
  if (typeof document === "undefined") return fallbackEm * 24;
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
  el.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px || fallbackEm * (parseFloat(getComputedStyle(el).fontSize) || 24);
}

function readTokens(el: HTMLElement): Tokens {
  const css = getComputedStyle(document.documentElement);
  const m = css.getPropertyValue("--reel-ease").match(/cubic-bezier\(([^)]+)\)/);
  const bezierParams = m ? (m[1].split(",").map(parseFloat) as [number, number, number, number]) : ([0.35, -0.02, 0.43, 1] as [number, number, number, number]);

  return {
    stepDur: token("--reel-step-dur", 130),
    stagger: token("--reel-stagger", 90),
    ease: bezier(bezierParams),
    offset: length(el, "--reel-side-offset", 0.52),
    sideScale: token("--reel-side-scale", 0.7),
    sideBlur: length(el, "--reel-side-blur", 0.083),
    sideOpacity: token("--reel-side-opacity", 0.17),
    centerScale: token("--reel-center-scale", 0.9),
    centerBlur: length(el, "--reel-center-blur", 0.042),
    anticDur: token("--reel-antic-dur", 100),
    anticScale: token("--reel-antic-scale", 0.94),
    anticLift: length(el, "--reel-antic-lift", 0.125),
    landDur: token("--reel-land-dur", 740),
    landPeak: token("--reel-land-peak", 1.03),
  };
}

function bezier([x1, y1, x2, y2]: [number, number, number, number]) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) {
      if (at(x1, x2, t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return at(y1, y2, t);
  };
}

function smooth(x: number) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

function wave(s: number) {
  return s >= 1 ? 0 : Math.exp(-3 * s) * Math.cos(3 * Math.PI * s) * (1 - s);
}

const WAVE_TROUGH = (() => {
  let low = 0;
  for (let i = 1; i < 400; i++) low = Math.min(low, wave(i / 400));
  return -low;
})();

function buildColumns(el: HTMLElement, str: string): ColItem[] {
  el.replaceChildren();
  const cols: ColItem[] = [];
  for (const ch of str) {
    if (ch < "0" || ch > "9") {
      const sep = document.createElement("span");
      sep.className = "t-reel-sep";
      sep.textContent = ch;
      el.appendChild(sep);
      continue;
    }
    const col = document.createElement("span");
    col.className = "t-reel-col";
    const sizer = document.createElement("span");
    sizer.className = "t-reel-sizer";
    sizer.textContent = "0";
    col.appendChild(sizer);
    const cells: HTMLElement[] = [];
    for (let d = 0; d < 10; d++) {
      const cell = document.createElement("span");
      cell.className = "t-reel-digit";
      cell.textContent = String(d);
      col.appendChild(cell);
      cells.push(cell);
    }
    el.appendChild(col);
    cols.push({ cells, digit: +ch, from: +ch });
  }
  return cols;
}

function rest(col: ColItem, digit: number) {
  col.cells.forEach((cell, d) => {
    cell.style.transform = "none";
    cell.style.filter = "none";
    cell.style.zIndex = "";
    cell.style.opacity = d === digit ? "1" : "0";
  });
}

function look(dist: number, middle: number, o: Tokens) {
  const angle = Math.min(dist * STEP, Math.PI / 2);
  const face = (Math.cos(angle) - Math.cos(STEP)) / (1 - Math.cos(STEP));
  return {
    angle,
    scale: o.sideScale + (middle - o.sideScale) * face,
    back: dist <= 1 ? 1 + (o.sideOpacity - 1) * dist : o.sideOpacity * (1 - (dist - 1) / (FADE_END - 1)),
  };
}

function place(
  col: ColItem,
  pos: number,
  spread: number,
  middle: number,
  o: Tokens,
  land: { scale: number; lift: number; opacity: number; arrive: number } | null
) {
  const radius = o.offset / Math.sin(STEP);
  col.cells.forEach((cell, d) => {
    let p = (((d - pos) % 10) + 10) % 10;
    if (p > 5) p -= 10;
    const dist = Math.abs(p);
    if (dist >= FADE_END) {
      cell.style.opacity = "0";
      return;
    }
    const l = look(dist, middle, o);
    let y = (p < 0 ? 1 : -1) * radius * Math.sin(l.angle);
    const blur = (o.centerBlur + (o.sideBlur - o.centerBlur) * Math.min(dist, 1)) * spread;
    const away = Math.max(0, Math.min(1, (dist - 0.3) / 0.5));
    let opacity = l.back * (1 - (1 - spread) * away);
    let scale = l.scale;
    let z = 100 - Math.round(dist * 10);
    if (land && d === col.digit) {
      y = y * land.arrive + land.lift;
      scale = land.scale;
      opacity = land.opacity;
      z = 200;
    }
    cell.style.transform = `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    cell.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : "none";
    cell.style.opacity = opacity.toFixed(3);
    cell.style.zIndex = String(z);
  });
}

/**
 * Rolls `el` towards `to`.
 * Binlik ayraç veya ondalık virgül konmaz (yalnızca ham rakam dizgisi: String(to)).
 * `forceSpin = true` olduğunda aynı sayıda bile olsa tam 1 tambur turu döner.
 */
function roll(el: HTMLElement, from: number, to: number, forceSpin = false): () => void {
  const str = String(to);
  el.setAttribute("aria-label", str);
  const cols = buildColumns(el, str);
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cols.forEach((c) => rest(c, c.digit));
    return () => {};
  }
  const o = readTokens(el);
  const fromDigits = String(from).padStart(cols.length, "0").slice(-cols.length);
  cols.forEach((c, i) => {
    c.from = +fromDigits[i];
    rest(c, c.from);
    if (!forceSpin && c.from === c.digit) {
      c.done = true;
    }
  });

  const t0 = performance.now();
  let raf = 0;
  const tick = () => {
    const t = performance.now() - t0;
    let running = false;
    cols.forEach((c, i) => {
      if (c.done) return;
      const local = t - i * o.stagger;
      if (local <= 0) {
        running = true;
        return;
      }
      let total = (c.digit - c.from + 10) % 10;
      if (total === 0 && forceSpin) {
        total = 10; // Tam bir tambur dönüşü
      }
      const pos = c.from + total * o.ease(local / (total * o.stepDur));
      const enter = Math.min(1, local / ENTER_MS);
      if (c.landAt === undefined && c.from + total - pos < LAND_AT) {
        c.landAt = t;
      }
      const since = c.landAt === undefined ? -1 : t - c.landAt;
      if (since >= o.anticDur + o.landDur) {
        rest(c, c.digit);
        c.done = true;
        return;
      }
      running = true;
      const middle = 1 + (o.centerScale - 1) * enter;
      let spread = enter;
      let land: { scale: number; lift: number; opacity: number; arrive: number } | null = null;
      if (since >= 0) {
        if (!c.landFrom) c.landFrom = look(c.from + total - pos, middle, o);
        const arrive = 1 - smooth(since / (o.anticDur + o.landDur * ARRIVE_AT));
        if (since < o.anticDur) {
          const a = smooth(since / o.anticDur);
          land = {
            scale: c.landFrom.scale + (o.anticScale - c.landFrom.scale) * a,
            lift: -o.anticLift * a,
            opacity: c.landFrom.back + (1 - c.landFrom.back) * a,
            arrive,
          };
        } else {
          const sp = since - o.anticDur;
          const sn = sp / o.landDur;
          const w = wave(sn);
          land = {
            scale: sn < 1 / 6 ? 1 + (o.anticScale - 1) * w : 1 - ((o.landPeak - 1) * w) / WAVE_TROUGH,
            lift: -o.anticLift * w,
            opacity: 1,
            arrive,
          };
          spread = 1 - Math.min(1, sp / CLEAR_MS);
        }
      }
      place(c, pos, spread, middle, o, land);
    });
    if (running) raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

export interface SpinningCounterProps {
  value: number;
  className?: string;
}

export function SpinningCounter({ value, className = "" }: SpinningCounterProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // İlk açılışta sıfırdan sipariş numarasına doğru dönüş
    let cancel = roll(el, 0, value, true);
    let timerId: number | undefined;

    // Her 3 blinkte bir (1 blink ~ 1.8s => 3 blink = ~5.4s) + rastgele varyasyon (4.8s - 6.8s)
    const scheduleNextSpin = () => {
      const nextDelay = 4800 + Math.random() * 2000;
      timerId = window.setTimeout(() => {
        if (!el) return;
        cancel?.();
        cancel = roll(el, value, value, true);
        scheduleNextSpin();
      }, nextDelay);
    };

    scheduleNextSpin();

    return () => {
      cancel?.();
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    };
  }, [value]);

  return <div ref={ref} className={`t-reel ${className}`} />;
}

export default SpinningCounter;
