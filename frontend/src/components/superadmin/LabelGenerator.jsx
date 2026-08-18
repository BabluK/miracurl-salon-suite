import { useState } from "react";
import { Printer } from "lucide-react";

const LOGO = "/ms-logo.png";

const LABEL_PRODUCTS = {
  shampoo: { name: "LONG & HEALTHY SHAMPOO", sub: "Hibiscus & Ceramides", net: "250 ml", mrp: "480",
    ing: "Aqua, Hibiscus Rosa-Sinensis Extract, Ceramide NP, Biotin, Panthenol, Argania Spinosa (Argan) Oil, Rosmarinus Officinalis Extract, Cocamidopropyl Betaine, Decyl Glucoside, Glycerin, Fragrance",
    use: "Apply to wet hair, massage gently into scalp, lather and rinse thoroughly. Use 2–3 times a week." },
  conditioner: { name: "NOURISH & SHINE CONDITIONER", sub: "Ceramides · Panthenol · Keratin", net: "250 ml", mrp: "420",
    ing: "Aqua, Ceramide NP, Panthenol, Hydrolyzed Keratin, Argania Spinosa (Argan) Oil, Silk Protein, Aloe Barbadensis Leaf Juice, Cetearyl Alcohol, Glycerin, Fragrance",
    use: "After shampooing, apply mid-length to ends. Leave for 2–3 minutes and rinse thoroughly." },
  "botox-500": { name: "HAIR BOTOX TREATMENT", sub: "Deep Repair · Smooth · Shine (Professional Use)", net: "500 ml", mrp: "4500",
    ing: "Aqua, Hydrolyzed Keratin, Peptides, Ceramide NP, Niacinamide, Pea Peptide, Argania Spinosa (Argan) Oil, Cetrimonium Chloride, Glycerin, Fragrance",
    use: "PROFESSIONAL USE ONLY. Apply on clean, towel-dried hair section by section. Process 30–45 min, rinse and blow-dry/seal as directed." },
  "botox-1000": { name: "HAIR BOTOX TREATMENT", sub: "Deep Repair · Smooth · Shine (Professional Use)", net: "1000 ml", mrp: "8000",
    ing: "Aqua, Hydrolyzed Keratin, Peptides, Ceramide NP, Niacinamide, Pea Peptide, Argania Spinosa (Argan) Oil, Cetrimonium Chloride, Glycerin, Fragrance",
    use: "PROFESSIONAL USE ONLY. Apply on clean, towel-dried hair section by section. Process 30–45 min, rinse and blow-dry/seal as directed." },
  "botox-shampoo": { name: "KERATIN BOTOX SHAMPOO", sub: "Smooth · Strengthen · Shine", net: "250 ml", mrp: "2500",
    ing: "Aqua, Hydrolyzed Keratin, Peptides, Amino Acids, Ceramide NP, Silk Protein, Zinc PCA, Decyl Glucoside, Glycerin, Fragrance",
    use: "Apply to wet hair, massage into a gentle lather and rinse. Ideal for maintaining botox-treated hair." },
};

export const LabelGenerator = () => {
  const [pid, setPid] = useState("shampoo");
  const [f, setF] = useState({ batch: "MC-2026-001", mfg: new Date().toISOString().slice(0, 7), mrp: "",
    marketer: "Miracurl Hair Science, Miracurl Unisex Family Salon, Marathahalli, Bengaluru, Karnataka — 560037",
    license: "", care: "+91 8217072523 · payments@miracurl-suite.com" });
  const p = LABEL_PRODUCTS[pid];
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));

  function printLabel() {
    const mrp = f.mrp || p.mrp;
    const shopUrl = `${window.location.origin}/products`;
    const qrSrc = `${window.location.origin}/api/public/products-qr?url=${encodeURIComponent(shopUrl)}`;
    const w = window.open("", "_blank", "width=760,height=900");
    w.document.write(`<html><head><title>Miracurl Label — ${p.name}</title>
<style>
  body{font-family:Georgia,serif;background:#fff;margin:0;padding:24px;display:flex;justify-content:center}
  .label{width:640px;border:3px solid #C9A227;border-radius:14px;background:#FFFDF7;padding:26px;color:#3d2b1f}
  .top{text-align:center}.top img{width:86px}.brand{color:#C9A227;letter-spacing:4px;font-size:20px;font-weight:bold;margin:6px 0 0}
  .sci{font-size:9px;letter-spacing:6px;color:#8a6d1a}.pname{color:#A61C3C;font-size:22px;font-weight:bold;margin:12px 0 2px;letter-spacing:2px}
  .sub{font-size:11px;color:#7a5c48;font-style:italic}.wave{border:none;border-top:2px solid #C9A227;width:120px;margin:12px auto}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:11px;margin-top:12px}
  .grid b{color:#A61C3C}.sec{margin-top:12px;font-size:10px;line-height:1.5}.sec b{color:#A61C3C;font-size:10px;letter-spacing:2px}
  .badges{text-align:center;font-size:9px;letter-spacing:1px;color:#8a6d1a;margin-top:12px}
  .mkqr{display:flex;gap:14px;align-items:center;margin-top:12px}
  .mkqr .sec{margin-top:0;flex:1}
  .qrbox{text-align:center;flex-shrink:0}.qrbox img{width:74px;height:74px;border:1px solid #eadfc2;border-radius:6px}
  .qrbox div{font-size:7.5px;color:#8a6d1a;letter-spacing:1px;margin-top:3px;font-weight:bold}
  .foot{text-align:center;font-size:9px;color:#7a5c48;margin-top:10px;border-top:1px solid #eadfc2;padding-top:8px}
  @media print{body{padding:0}}
</style></head><body><div class="label">
  <div class="top"><img src="${window.location.origin}${LOGO}"/><div class="brand">MIRACURL</div><div class="sci">HAIR SCIENCE</div>
  <div class="pname">${p.name}</div><div class="sub">${p.sub}</div><hr class="wave"/></div>
  <div class="grid">
    <div><b>Net Content:</b> ${p.net}</div><div><b>MRP:</b> ₹${mrp}/- (incl. of all taxes)</div>
    <div><b>Batch No:</b> ${f.batch}</div><div><b>Mfg Date:</b> ${f.mfg}</div>
    <div><b>Best Before:</b> 24 months from Mfg</div><div><b>Country of Origin:</b> India</div>
    ${f.license ? `<div style="grid-column:1/3"><b>Mfg Lic. No:</b> ${f.license}</div>` : ""}
  </div>
  <div class="sec"><b>INGREDIENTS:</b> ${p.ing}</div>
  <div class="sec"><b>DIRECTIONS:</b> ${p.use}</div>
  <div class="sec"><b>CAUTION:</b> For external use only. Avoid contact with eyes; if contact occurs rinse immediately. Keep out of reach of children. Store in a cool, dry place.</div>
  <div class="badges">PARABEN FREE · SULFATE FREE · SILICONE FREE · CRUELTY FREE · VEGAN</div>
  <div class="mkqr">
    <div class="sec"><b>MARKETED BY:</b> ${f.marketer}</div>
    <div class="qrbox"><img src="${qrSrc}"/><div>SCAN TO REORDER</div></div>
  </div>
  <div class="foot">Customer care: ${f.care} · www.miracurl.com<br/>Science. Nature. You.</div>
</div><script>setTimeout(()=>window.print(),600)</script></body></html>`);
    w.document.close();
  }

  const inp = "px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-full";
  return (
    <div className="mt-5 border-t border-slate-100 pt-4" data-testid="label-generator">
      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Printer className="w-4 h-4 text-rose-500" /> Bottle Label Generator</h4>
      <p className="text-[11px] text-slate-400 mt-0.5">Print-ready label with ingredients, MRP, batch & compliance details — hand it to your manufacturer.</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <select value={pid} onChange={e => setPid(e.target.value)} className={inp} data-testid="label-product-select">
          {Object.entries(LABEL_PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v.name} — {v.net}</option>)}
        </select>
        <input value={f.mrp} onChange={set("mrp")} placeholder={`MRP ₹ (default ${p.mrp})`} className={inp} data-testid="label-mrp-input" />
        <input value={f.batch} onChange={set("batch")} placeholder="Batch No" className={inp} data-testid="label-batch-input" />
        <input value={f.mfg} onChange={set("mfg")} placeholder="Mfg date (YYYY-MM)" className={inp} data-testid="label-mfg-input" />
        <input value={f.license} onChange={set("license")} placeholder="Mfg licence no (optional)" className={inp} data-testid="label-license-input" />
        <input value={f.care} onChange={set("care")} placeholder="Customer care" className={inp} data-testid="label-care-input" />
        <textarea value={f.marketer} onChange={set("marketer")} rows={2} placeholder="Marketed by (name + address)" className={`${inp} col-span-2`} data-testid="label-marketer-input" />
      </div>
      <button onClick={printLabel} data-testid="label-print-btn"
        className="mt-3 w-full py-2.5 rounded-xl bg-[#A61C3C] text-white text-sm font-bold hover:opacity-90 transition">
        🖨️ Generate & Print Label
      </button>
    </div>
  );
};
