import { useState } from "react";
import { toast } from "sonner";
import { X, Eye, EyeOff, Copy, MessageCircle } from "lucide-react";
import { openWhatsApp } from "@/lib/share";

export function TempCredModal({ cred, onClose }) {
  const [showPw, setShowPw] = useState(true);
  const copyAll = async () => {
    const text = `Miracurl login for ${cred.name}\n\nEmail: ${cred.email}\nTemporary password: ${cred.temp_password}\n\nYou'll be asked to set your own password on first login. Login at: ${window.location.origin}/login`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it into WhatsApp / SMS");
    } catch {
      toast.error("Copy failed");
    }
  };
  const whatsapp = () => {
    const text = `👋 Hey ${cred.name}, your salon login is ready:\n\n📧 Email: ${cred.email}\n🔑 Temporary password: ${cred.temp_password}\n\nLog in at: ${window.location.origin}/login\n\nYou'll be asked to set your own password on first login.`;
    openWhatsApp(text, cred.phone);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="card-light w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-playfair text-xl">Login credentials created</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 mb-4">
          ⚠️ This is the <b>only time</b> you&apos;ll see this password. Share it with {cred.name} now — they&apos;ll change it on first login.
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-1">Email</div>
            <div className="font-mono bg-slate-50 border border-slate-200 rounded-md px-3 py-2">{cred.email}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Temporary password</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono bg-slate-50 border border-slate-200 rounded-md px-3 py-2 tracking-wider">
                {showPw ? cred.temp_password : "•".repeat(cred.temp_password.length)}
              </div>
              <button
                onClick={() => setShowPw(!showPw)}
                className="p-2 text-slate-500 hover:text-sky-600"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
          <button onClick={copyAll} className="btn-slate flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button onClick={whatsapp} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20b859] text-white font-medium rounded-md text-sm">
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 btn-blue">Done</button>
      </div>
    </div>
  );
}
