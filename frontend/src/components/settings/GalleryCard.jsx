import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Images, Upload, Trash2, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function GalleryCard() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const noun = resto ? "restaurant" : "salon";
  const [photos, setPhotos] = useState([]);
  const [max, setMax] = useState(6);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get("/salon/gallery").then(r => { setPhotos(r.data.photos); setMax(r.data.max); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      await api.post("/salon/gallery", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Photo added to your public salon page ✦");
      load();
    } catch (er) { toast.error(er.response?.data?.detail || "Upload failed"); }
    setBusy(false);
    e.target.value = "";
  };

  const remove = async (id) => {
    try {
      await api.delete(`/salon/gallery/${id}`);
      setPhotos(p => p.filter(x => x.id !== id));
    } catch { toast.error("Couldn't remove photo"); }
  };

  const base = process.env.REACT_APP_BACKEND_URL;

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="gallery-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Images className="w-4 h-4 text-pink-500" /> {resto ? "Restaurant" : "Salon"} photo gallery</h2>
          <p className="text-xs text-slate-500 mt-1">Optional — show off your {noun} on your public page. Up to {max} photos; visual proof turns visitors into {resto ? "reservations" : "bookings"}.</p>
        </div>
        <a href={`/salon/${tenant?.slug || ""}`} target="_blank" rel="noreferrer" data-testid="settings-open-salon-page-btn"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold hover:brightness-110 shadow-sm">
          Open my {noun} page <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {photos.map(p => (
          <div key={p.id} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200" data-testid={`gallery-photo-${p.id}`}>
            <img src={`${base}${p.url}`} alt={noun} className="w-full h-full object-cover" />
            <button onClick={() => remove(p.id)} data-testid={`gallery-delete-${p.id}`}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="gallery-upload-btn"
            className="aspect-square rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-pink-400 hover:text-pink-500 transition-colors flex flex-col items-center justify-center gap-1 text-[10px] font-semibold disabled:opacity-50">
            <Upload className="w-4 h-4" /> {busy ? "Uploading…" : "Add photo"}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={upload} data-testid="gallery-file-input" />
    </div>
  );
}
