import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Palette, Download, ExternalLink, Sparkles, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { AutoColourServices } from "@/components/settings/AutoColourServices";

const EMPTY_SHADE = { name: "", tag: "", swatch: ["#4a3728", "#8b6f56", "#c9ad8f"], suits: ["warm", "cool", "neutral"], depth: ["light", "medium", "deep"] };

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export const ColorTryOnCard = () => {
  const [picks, setPicks] = useState([]);
  const [colors, setColors] = useState([]);
  const [menColors, setMenColors] = useState([]);
  const [poster, setPoster] = useState(null); // object URL of the branded PNG
  const [busy, setBusy] = useState(false);
  const [shade, setShade] = useState(EMPTY_SHADE);
  const [adding, setAdding] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [services, setServices] = useState([]);
  const [linking, setLinking] = useState(null); // color being linked
  const [quote, setQuote] = useState("");
  const saveQuote = async (colorId, explicit) => {
    try {
      const raw = explicit !== undefined ? explicit : quote;
      const price = raw === "" || raw == null ? null : Number(raw);
      const { data } = await api.put(`/hair-colors/${colorId}/price`, { price });
      toast.success(price == null ? "Shade now uses the service price" : `${linking.name} quoted at ₹${price}`);
      setLinking(l => l ? { ...l, ...data.link } : l); loadColors();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save price"); }
  };
  const linkService = async (colorId, serviceId) => {
    try {
      await api.put(`/hair-colors/${colorId}/service`, { service_id: serviceId || null });
      toast.success(serviceId ? "Service linked — bookings for this shade now pre-select it" : "Link removed");
      setLinking(null); loadColors();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't link"); }
  };
  const loadColors = () => api.get("/hair-colors").then(r => { setColors(r.data.colors || []); setMenColors((r.data.men_colors || []).filter(c => !c.custom)); }).catch(() => {});
  const toggle = (k, v) => setShade(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }));
  const addShade = async () => {
    if (shade.name.trim().length < 2) return toast.error("Give the shade a name");
    setAdding(true);
    try {
      await api.post("/hair-colors/custom", shade);
      toast.success("Shade added — Mira is painting its photo (≈30 s), it's already live on your try-on page");
      setShade(EMPTY_SHADE); setShowBuilder(false); loadColors();
      setTimeout(loadColors, 35000);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't add shade"); }
    finally { setAdding(false); }
  };
  const removeShade = async (id) => {
    try { await api.delete(`/hair-colors/custom/${id}`); toast.success("Shade removed"); loadColors(); }
    catch { toast.error("Couldn't remove"); }
  };
  const slug = localStorage.getItem("miracurl_tenant") || "";
  const link = `${window.location.origin}/color/${slug}`;

  useEffect(() => {
    api.get("/color-picks?limit=8").then(r => setPicks(r.data.picks || [])).catch(() => {});
    loadColors();
    api.get("/services").then(r => setServices((r.data.services || r.data || []).filter(x => x.active !== false))).catch(() => {});
    let url;
    api.get("/color/poster", { responseType: "blob" }).then(r => { url = URL.createObjectURL(r.data); setPoster(url); }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const href = poster || URL.createObjectURL((await api.get("/color/poster", { responseType: "blob" })).data);
      const a = document.createElement("a"); a.href = href; a.download = `hair-colour-tryon-${slug}.png`; a.click();
      toast.success("Poster downloaded — print it for the colour bar & reception");
    } catch { toast.error("Couldn't build the poster"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-amber-200/70 shadow-[0_8px_30px_-12px_rgba(180,140,50,0.35)]" data-testid="color-tryon-card">
      <div className="grid md:grid-cols-[260px_1fr]">
        {/* Poster preview on a rich gradient panel */}
        <div className="relative bg-[radial-gradient(120%_90%_at_20%_0%,#3a2418_0%,#17111a_55%,#0b0810_100%)] p-5 flex items-center justify-center min-h-[300px]">
          <div className="absolute inset-3 rounded-2xl border border-amber-400/30 pointer-events-none" />
          {poster ? (
            <img src={poster} alt="QR poster" data-testid="color-poster-preview"
              className="w-[190px] rounded-xl border-2 border-amber-400 shadow-[0_12px_40px_-10px_rgba(212,175,55,0.6)]" />
          ) : (
            <div className="w-[190px] aspect-[2/3] rounded-xl border-2 border-amber-400/40 flex items-center justify-center text-amber-200/70 text-xs"><Loader2 className="w-5 h-5 animate-spin" /></div>
          )}
        </div>

        <div className="bg-white p-5 min-w-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-rose-400 text-white flex items-center justify-center shrink-0"><Palette className="w-5 h-5" /></div>
            <div>
              <h3 className="font-semibold text-slate-900">Hair Colour Try-On QR</h3>
              <p className="text-xs text-slate-500 mt-0.5">Guests scan → front camera reads their skin undertone → the shades that suit them are highlighted → <b>"See it on me"</b> paints the colour on their own photo, front & back → one tap books a Colour Appointment. Their pick + code lands in your bell.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={download} disabled={busy} data-testid="color-poster-download"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download QR poster
            </button>
            <a href={link} target="_blank" rel="noreferrer" data-testid="color-tryon-open"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">
              <ExternalLink className="w-4 h-4" /> Open try-on page
            </a>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 break-all">{link}</p>

          {[["THE COLLECTION · FOR HER", colors, "color-catalog-strip"], ["FOR HIM", menColors, "color-catalog-strip-men"]].map(([title, list, tid]) => (
            <div key={tid}>
              <p className="text-[11px] font-semibold text-slate-500 tracking-wide mt-4 mb-1.5 inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-500" /> {title} · {list.length} SHADES</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid={tid}>
                {list.map(c => (
                  <div key={c.id} title={`${c.name}${c.service_name ? ` → ${c.service_name} ₹${c.price}` : " · tap to link a service"}`} onClick={() => { setLinking(c); setQuote(c.price_override ?? ""); }} data-testid={`color-tile-${c.id}`}
                    className={`relative shrink-0 w-14 h-[70px] rounded-lg overflow-hidden border cursor-pointer ${linking?.id === c.id ? "ring-2 ring-slate-900" : ""} ${c.custom ? "border-amber-400 ring-1 ring-amber-300" : "border-slate-200"}`} style={{ background: `linear-gradient(160deg, ${c.swatch.join(",")})` }}>
                    {c.service_name && <span className={`absolute bottom-0 inset-x-0 ${c.price_override != null ? "bg-amber-500/95" : "bg-emerald-600/90"} text-white text-[9px] text-center font-semibold leading-4`} data-testid={`color-tile-price-${c.id}`}>₹{c.price}</span>}
                    {c.image_url && <img src={`${BACKEND}${c.image_url}?w=320`} alt={c.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />}
                    {c.custom && !c.image_url && <Loader2 className="absolute inset-0 m-auto w-4 h-4 text-white animate-spin" />}
                    {c.custom && (
                      <button onClick={() => removeShade(c.id)} title="Remove shade" data-testid={`color-custom-remove-${c.id}`}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {linking && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5" data-testid="color-link-row">
              <span className="text-xs text-slate-700"><b>{linking.name}</b> → colour service:</span>
              <select defaultValue={linking.service_id || ""} onChange={e => linkService(linking.id, e.target.value)} data-testid="color-link-select"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 [&_option]:bg-white [&_option]:text-slate-800">
                <option value="">— not linked (booking shows "{linking.name} Colour") —</option>
                {services.map(sv => <option key={sv.id} value={sv.id}>{sv.name} · ₹{sv.price}</option>)}
              </select>
              {linking.service_id && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-700" data-testid="color-quote-row">
                  · quote ₹
                  <input type="number" min="0" step="50" value={quote} onChange={e => setQuote(e.target.value)} placeholder={String(linking.service_price ?? linking.price ?? "")} data-testid="color-quote-input"
                    className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800" />
                  <button onClick={() => saveQuote(linking.id)} data-testid="color-quote-save" className="text-xs font-semibold bg-slate-900 text-white rounded-lg px-2.5 py-1.5">Save</button>
                  {linking.price_override != null && <button onClick={() => { setQuote(""); saveQuote(linking.id, null); }} data-testid="color-quote-clear" className="text-xs text-slate-500 underline">use service price ₹{linking.service_price}</button>}
                </span>
              )}
              <button onClick={() => setLinking(null)} className="text-xs text-slate-400 ml-auto">close</button>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Tap a shade to link it to a colour service and set its own quote — the try-on and booking use that price (amber badge = custom quote).</p>
          <AutoColourServices onDone={loadColors} linkedCount={[...colors, ...menColors].filter(c => c.service_id).length} total={colors.length + menColors.length} />
          <button onClick={() => setShowBuilder(v => !v)} data-testid="color-builder-toggle"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> {showBuilder ? "Close shade builder" : "Add your own shade — Mira paints it"}
          </button>
          {showBuilder && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2" data-testid="color-builder">
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={shade.name} onChange={e => setShade({ ...shade, name: e.target.value })} placeholder="Shade name, e.g. Espresso Caramel Melt" maxLength={40} data-testid="color-builder-name"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800" />
                <input value={shade.tag} onChange={e => setShade({ ...shade, tag: e.target.value })} placeholder="Tagline, e.g. Warm · Glossy · Signature" maxLength={60} data-testid="color-builder-tag"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-500">Tones (root → ends)</span>
                {shade.swatch.map((hex, i) => (
                  <input key={i} type="color" value={hex} data-testid={`color-builder-swatch-${i}`}
                    onChange={e => setShade(s => ({ ...s, swatch: s.swatch.map((x, j) => j === i ? e.target.value : x) }))}
                    className="w-9 h-9 rounded-lg border border-slate-200 bg-white p-0.5" />
                ))}
                <div className="h-9 flex-1 min-w-[90px] rounded-lg border border-slate-200" style={{ background: `linear-gradient(90deg, ${shade.swatch.join(",")})` }} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-slate-500 self-center">Suits:</span>
                {["warm", "cool", "neutral"].map(v => <button key={v} onClick={() => toggle("suits", v)} className={`px-2 py-1 rounded-full border ${shade.suits.includes(v) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{v}</button>)}
                <span className="text-slate-500 self-center ml-2">Skin depth:</span>
                {["light", "medium", "deep"].map(v => <button key={v} onClick={() => toggle("depth", v)} className={`px-2 py-1 rounded-full border ${shade.depth.includes(v) ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{v}</button>)}
              </div>
              <button onClick={addShade} disabled={adding} data-testid="color-builder-save"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-semibold disabled:opacity-60">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Add shade & let Mira paint it
              </button>
            </div>
          )}

          {picks.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3" data-testid="color-picks-list">
              <p className="text-[11px] font-semibold text-slate-500 tracking-wide mb-2">RECENT PICKS</p>
              {picks.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-800"><b className="font-mono text-amber-700">{p.code}</b> · {p.name || "Guest"} {p.phone && <span className="text-slate-400">· {p.phone}</span>}</span>
                  <span className="text-slate-600 text-xs text-right">{p.color_name}{p.undertone && <span className="text-slate-400"> · {p.undertone}</span>}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">Also works for staff: tick "Scanned by salon staff" when you scan for a walk-in.</p>
        </div>
      </div>
    </div>
  );
};
