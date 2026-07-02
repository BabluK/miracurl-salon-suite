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
    const isBooking = pathname.startsWith("/book");
    const href = isBooking ? "/manifest.json" : "/manifest-admin.json";
    const title = isBooking ? "M" : "Miracurl";
    const theme = isBooking ? "#ec4899" : "#D4AF37";

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);

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
