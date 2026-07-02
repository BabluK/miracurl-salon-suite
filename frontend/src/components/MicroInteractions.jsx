import { useEffect } from "react";

const INTERACTIVE = "button, a, [role='button']";

/**
 * Global micro-interactions:
 * - Magnetic hover (fine pointers): elements gently pull toward the cursor,
 *   with a ~20px sticky release radius around the element.
 * - Tap fluidity (all pointers): 98% press squeeze + centered material ripple.
 */
export default function MicroInteractions() {
  useEffect(() => {
    const fine = window.matchMedia?.("(pointer: fine)")?.matches;
    let magnetEl = null;

    function applyPull(el, x, y) {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const max = 5;
      const tx = Math.max(-max, Math.min(max, dx * 0.16));
      const ty = Math.max(-max, Math.min(max, dy * 0.16));
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    function releaseMagnet() {
      if (!magnetEl) return;
      const el = magnetEl;
      magnetEl = null;
      el.style.transform = "";
      setTimeout(() => el.classList.remove("mi-magnet"), 320);
    }

    function onMove(e) {
      const hovered = e.target?.closest?.(INTERACTIVE);
      if (hovered && !hovered.closest("[data-no-magnet]")) {
        if (magnetEl && magnetEl !== hovered) releaseMagnet();
        if (!magnetEl) {
          magnetEl = hovered;
          hovered.classList.add("mi-magnet");
        }
        applyPull(magnetEl, e.clientX, e.clientY);
        return;
      }
      if (magnetEl) {
        // 20px attraction radius — keep pulling while cursor stays close
        const r = magnetEl.getBoundingClientRect();
        const near =
          e.clientX >= r.left - 20 && e.clientX <= r.right + 20 &&
          e.clientY >= r.top - 20 && e.clientY <= r.bottom + 20;
        if (near) applyPull(magnetEl, e.clientX, e.clientY);
        else releaseMagnet();
      }
    }

    function onDown(e) {
      const el = e.target?.closest?.(INTERACTIVE);
      if (!el) return;

      el.classList.add("mi-press");
      const clear = () => el.classList.remove("mi-press");
      window.addEventListener("pointerup", clear, { once: true });
      window.addEventListener("pointercancel", clear, { once: true });

      const cs = window.getComputedStyle(el);
      if (cs.display === "inline") return;
      if (cs.position === "static") el.style.position = "relative";
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.1;
      const wrap = document.createElement("span");
      wrap.className = "mi-ripple-wrap";
      const dot = document.createElement("span");
      dot.className = "mi-ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${r.width / 2 - size / 2}px`;
      dot.style.top = `${r.height / 2 - size / 2}px`;
      wrap.appendChild(dot);
      el.appendChild(wrap);
      setTimeout(() => wrap.remove(), 600);
    }

    if (fine) document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      if (fine) document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      releaseMagnet();
    };
  }, []);

  return null;
}
