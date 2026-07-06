import { useState } from "react";
import { toast } from "sonner";
import { Bluetooth, Usb, Loader2, Printer, X, CheckCircle2 } from "lucide-react";
import {
  buildReceiptBytes, printerSupport, getConnectedPrinter,
  connectBluetooth, connectSerial, disconnectPrinter, printBytes,
  getPaperWidth, setPaperWidth,
} from "@/lib/thermalPrinter";

export default function ThermalPrintButton({ invoice, tenant }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(getPaperWidth());
  const [connected, setConnected] = useState(getConnectedPrinter());
  const support = printerSupport();

  async function doPrint() {
    setBusy(true);
    try {
      await printBytes(buildReceiptBytes(invoice, tenant, width));
      toast.success(`Bill sent to ${connected?.name || "printer"} ✦`);
      setOpen(false);
    } catch (e) {
      toast.error(e.message || "Print failed — check the printer");
    } finally { setBusy(false); }
  }

  async function connect(kind) {
    setBusy(true);
    try {
      const name = kind === "bluetooth" ? await connectBluetooth() : await connectSerial();
      setConnected(getConnectedPrinter());
      toast.success(`Connected to ${name} ✦`);
    } catch (e) {
      if (e.name !== "NotFoundError") toast.error(e.message || "Couldn't connect");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    await disconnectPrinter();
    setConnected(null);
    toast.info("Printer disconnected");
  }

  function onMainClick() {
    if (connected) doPrint();
    else setOpen(true);
  }

  if (!support.bluetooth && !support.serial) return null; // e.g. iPhone — system Print covers it

  return (
    <>
      <button
        data-testid="thermal-print-btn"
        onClick={onMainClick}
        disabled={busy}
        className="w-full mt-3 px-3 py-2.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {connected ? `Print on ${connected.name}` : "Print on thermal printer"}
        {connected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()} data-testid="printer-connect-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-lg">Connect a printer</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" data-testid="printer-modal-close"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Pair once — future bills print in one tap.</p>

            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">Paper width</div>
              <div className="flex gap-2">
                {[{ v: 32, l: "58 mm" }, { v: 48, l: "80 mm" }].map(o => (
                  <button key={o.v} data-testid={`paper-width-${o.l.replace(" ", "")}`}
                    onClick={() => { setWidth(o.v); setPaperWidth(o.v); }}
                    className={`flex-1 text-xs px-3 py-2 rounded-lg border ${width === o.v ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {support.bluetooth && (
                <button data-testid="connect-bluetooth-btn" onClick={() => connect("bluetooth")} disabled={busy}
                  className="w-full px-3 py-3 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-sm font-medium hover:bg-sky-100 flex items-center gap-2.5 disabled:opacity-50">
                  <Bluetooth className="w-4 h-4" />
                  <span className="text-left flex-1">Bluetooth thermal printer<br /><span className="text-[10px] font-normal text-sky-600/70">Turn the printer on, then pick it from the list</span></span>
                </button>
              )}
              {support.serial && (
                <button data-testid="connect-serial-btn" onClick={() => connect("serial")} disabled={busy}
                  className="w-full px-3 py-3 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 flex items-center gap-2.5 disabled:opacity-50">
                  <Usb className="w-4 h-4" />
                  <span className="text-left flex-1">USB / cable thermal printer<br /><span className="text-[10px] font-normal text-violet-600/70">Plug into this computer, then pick the port</span></span>
                </button>
              )}
            </div>

            {connected && (
              <div className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                <span className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {connected.name}</span>
                <div className="flex gap-2">
                  <button data-testid="printer-test-print-btn" onClick={doPrint} disabled={busy} className="text-xs px-2.5 py-1 rounded bg-emerald-600 text-white font-medium">Print bill</button>
                  <button data-testid="printer-disconnect-btn" onClick={disconnect} className="text-xs px-2.5 py-1 rounded border border-emerald-300 text-emerald-700">Disconnect</button>
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-400 mt-4">
              Works on Chrome (Android, Windows, Mac). On iPhone/iPad use the regular Print button —
              it opens the system dialog for AirPrint/A4 printers.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
