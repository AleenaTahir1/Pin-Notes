import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 350;
// Once a tooltip has been seen, moving to the next button shows its tip almost at once.
const QUICK_DELAY_MS = 40;
const QUICK_WINDOW_MS = 500;

/**
 * One quick, styled tooltip for every button that has a `title`. The OS tooltip is slow
 * (about a second) and plain, so on hover the `title` is moved to `data-tip` (and kept as
 * the accessible label) before the OS one can appear, and this layer shows it instead,
 * clamped inside the window so it is never cut off.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastHiddenAt = -Infinity;
    let shown = false;

    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (shown) lastHiddenAt = performance.now();
      shown = false;
      current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (!target || target === current) return;
      const title = target.getAttribute('title');
      if (title) {
        target.dataset.tip = title;
        if (!target.getAttribute('aria-label')) target.setAttribute('aria-label', title);
        target.removeAttribute('title');
      }
      const text = target.dataset.tip;
      if (!text) return;
      if (timer) clearTimeout(timer);
      const quick = shown || performance.now() - lastHiddenAt < QUICK_WINDOW_MS;
      current = target;
      timer = setTimeout(() => {
        if (current !== target || !target.isConnected) return;
        shown = true;
        setTip({ text, rect: target.getBoundingClientRect() });
      }, quick ? QUICK_DELAY_MS : SHOW_DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      if (timer) clearTimeout(timer);
      timer = null;
      if (shown) lastHiddenAt = performance.now();
      shown = false;
      current = null;
      setTip(null);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Below the button by default, above it if there is no room; always inside the window.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !tip) return;
    const m = 6;
    const { rect } = tip;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.min(Math.max(left, m), Math.max(m, window.innerWidth - w - m));
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - m) top = Math.max(m, rect.top - h - 6);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={tipRef} className="app-tooltip" role="tooltip" style={{ left: 0, top: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>,
    document.body,
  );
}
