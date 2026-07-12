import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Serves TWO installable PWAs from one codebase:
 * - /book/*  → client booking app, named "M"       (manifest.json)
 * - all else → owner/staff app, named "Miracurl"   (manifest-admin.json)
 * Distinct manifest `id`s let Android + iOS install both side by side.
 */
export default function ManifestSwitcher() {
  const { pathname } = useLocation();

  useEffect(() => {
    const isBooking = ["/book", "/salon", "/demo-slot", "/review"].some((p) => pathname.startsWith(p));
    const href = isBooking ? "/manifest.json" : "/manifest-admin.json";
    const title = isBooking ? "Miracurl Book" : "Miracurl Partner";
    const theme = isBooking ? "#8B5CF6" : "#059669";
    const touchIcon = isBooking ? "/icon-192.png" : "/icon-admin-192.png";

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);

    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach((l) => l.setAttribute("href", touchIcon));

    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitle) {
      appleTitle = document.createElement("meta");
      appleTitle.setAttribute("name", "apple-mobile-web-app-title");
      document.head.appendChild(appleTitle);
    }
    appleTitle.setAttribute("content", title);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme);
  }, [pathname]);

  return null;
}
