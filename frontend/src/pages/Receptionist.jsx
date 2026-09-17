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
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-700 font-semibold">WhatsApp · 24×7</div>
          <h1 className="font-playfair text-3xl sm:text-4xl text-slate-900 mt-1">Mira Receptionist</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Guests message your WhatsApp; Mira answers in seconds — in English, Hindi, Kannada or Hinglish — with your real {resto ? "menu, timings and live tables, and reserves the table" : "prices, timings and open slots, and books the appointment"} herself. No staff needed.
          </p>
        </div>
        {err && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3" data-testid="receptionist-error">{err}</div>}
        {data && <ReceptionistHero data={data} resto={resto} onChange={load} />}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          <div className="xl:col-span-2"><ReceptionistSim resto={resto} /></div>
          <div className="xl:col-span-3"><ReceptionistThreads threads={data?.threads || []} onChange={load} /></div>
        </div>
      </div>
    </div>
  );
}
