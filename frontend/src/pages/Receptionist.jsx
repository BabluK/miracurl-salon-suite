import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ReceptionistHero } from "@/components/receptionist/ReceptionistHero";
import { ReceptionistSim } from "@/components/receptionist/ReceptionistSim";
import { ReceptionistThreads } from "@/components/receptionist/ReceptionistThreads";

export default function Receptionist() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api.get("/whatsapp-link/receptionist").then(r => setData(r.data)).catch(e => setErr(e.response?.data?.detail || "Couldn't load")), []);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="receptionist-page">
      <div className="max-w-[1500px] space-y-6">
        {err && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3" data-testid="receptionist-error">{err}</div>}
        {data && <ReceptionistHero data={data} resto={resto} onChange={load} />}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          <div className="xl:col-span-2"><ReceptionistSim resto={resto} /></div>
          <div className="xl:col-span-3"><ReceptionistThreads threads={data?.threads || []} onChange={load} /></div>
        </div>
        <div className="mt-6 rounded-2xl bg-white border border-slate-100 px-5 py-4 flex items-center justify-between gap-4" data-testid="receptionist-footer">
          <div className="flex items-center gap-3">
            <img src="/assets/brand/ms-logo-gold.png" alt="" className="w-9 h-9 rounded-full" onError={e => { e.currentTarget.style.display = "none"; }} />
            <div><div className="text-sm font-bold text-slate-900">Miracurl AI {resto ? "Restaurant" : "Salon"} Suite</div><div className="text-xs text-slate-500">Smarter {resto ? "Restaurants" : "Salons"}. Happier Customers.</div></div>
          </div>
          <div className="font-playfair italic text-slate-500 text-base hidden sm:block">{resto ? "Dining" : "Beauty"} Conversations, Automated ♡</div>
        </div>
      </div>
    </div>
  );
}
