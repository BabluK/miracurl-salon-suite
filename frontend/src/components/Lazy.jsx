import { useEffect, useRef, useState } from "react";

export function Lazy({ children, eager = false, minHeight = 120 }) {
  const ref = useRef(null);
  const [show, setShow] = useState(eager);
  useEffect(() => {
    if (show || !ref.current) return;
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "700px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [show]);
  return show ? children : <div ref={ref} style={{ minHeight }} className="mt-6 rounded-2xl border border-slate-100 bg-white/60 animate-pulse" aria-hidden />;
}
