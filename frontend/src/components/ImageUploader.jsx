import { useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";

/**
 * Reusable image picker + uploader used by Services / Staff / Products forms.
 * Accepts a laptop/phone file, POSTs to /api/uploads/image, and calls
 * onUploaded(url) with the URL the parent should save to their DB field.
 *
 * Props
 *   value      — current image URL (may be empty)
 *   onChange   — (newUrl: string) => void — receives the new URL after upload OR
 *                a manually-pasted URL for backwards compatibility with existing
 *                Unsplash-based seed data
 *   kind       — "staff" | "service" | "product" | "misc" — segregates in storage
 *   fallback   — placeholder image if no value + no upload yet (optional)
 *   circular   — render preview as circle (for avatars) vs rectangle
 */
export default function ImageUploader({ value, onChange, onUploaded, kind = "misc", fallback, circular = false }) {
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const inputRef = useRef(null);

  const preview = value || fallback || "";

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpe?g|png|gif|webp)$/i.test(file.type)) {
      toast.error("Only JPG, PNG, GIF or WebP images are allowed");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image too large — please pick one under 3MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/uploads/image?kind=${kind}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
      toast.success("Image uploaded ✦");
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || "Upload failed";
      toast.error(typeof detail === "string" ? detail : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clearImage() {
    onChange("");
  }

  return (
    <div className="space-y-2" data-testid={`image-uploader-${kind}`}>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div
          className={`relative bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 ${
            circular ? "w-20 h-20 rounded-full" : "w-24 h-24 rounded-lg"
          }`}
          data-testid={`image-uploader-preview-${kind}`}
        >
          {preview ? (
            <img src={preview} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">no image</div>
          )}
          {value && (
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white shadow border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-600"
              aria-label="Remove image"
              data-testid={`image-uploader-clear-${kind}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFile}
            className="hidden"
            data-testid={`image-uploader-input-${kind}`}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-100 disabled:opacity-60"
            data-testid={`image-uploader-btn-${kind}`}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Uploading…" : "Choose from laptop"}
          </button>
          <p className="text-[11px] text-slate-500 mt-1.5">
            JPG, PNG, WebP · under 3MB ·{" "}
            <button type="button" onClick={() => setShowUrl(!showUrl)} className="underline underline-offset-2 hover:text-slate-700" data-testid={`image-uploader-toggle-url-${kind}`}>
              {showUrl ? "hide URL" : "or paste a URL"}
            </button>
          </p>
          {showUrl && (
            <input
              type="url"
              placeholder="https://... (optional)"
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              className="mt-2 w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-sky-200"
              data-testid={`image-uploader-url-${kind}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
