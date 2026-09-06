import { toast } from "sonner";

export async function fetchCardBlob(api, path, fmt = "square") {
  const { data } = await api.get(path, { params: { origin: window.location.origin, fmt }, responseType: "blob" });
  return data;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function whatsappShareText({ name, tier, salon, url }) {
  return `🏆 ${name} is the new Brand Model of ${salon} and wins a ${tier} Membership! ✨\n\nWant to be next? Spend, share your look & apply here: ${url}`;
}

export async function shareWinnerCard({ blob, filename, text }) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return "shared"; } catch { /* user cancelled */ }
  }
  downloadBlob(blob, filename);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  toast.success("Card downloaded — attach it in WhatsApp ✦");
  return "downloaded";
}
