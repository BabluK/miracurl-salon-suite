import { toast } from "sonner";

export async function shareWithPoster(imageUrl, caption) {
  let blob = null;
  try {
    blob = await (await fetch(imageUrl)).blob();
  } catch { /* image fetch failed — text-only share below */ }
  if (blob) {
    const file = new File([blob], "poster.jpg", { type: blob.type || "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "poster.jpg";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.info("Poster downloaded — attach it to your WhatsApp status or broadcast ✦");
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank", "noopener,noreferrer");
}
