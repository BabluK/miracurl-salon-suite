// "Contact Miracurl HQ" — salon admins email the platform team (with attachments).
import { useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Headset, Paperclip, Send, X } from "lucide-react";

export const ContactHQSection = () => {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  function pickFiles(e) {
    const picked = Array.from(e.target.files || []);
    const next = [...files, ...picked].slice(0, 3);
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > 10 * 1024 * 1024) { toast.error("Attachments too large — max 10MB total"); return; }
    setFiles(next);
    e.target.value = "";
  }

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("message", message);
      files.forEach(f => fd.append("files", f));
      await api.post("/contact-hq", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Message sent to the Miracurl team ✦ We'll get back to you soon!");
      setSubject(""); setMessage(""); setFiles([]);
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Couldn't send — please try again");
    } finally { setBusy(false); }
  }

  return (
    <div className="card-light" data-testid="contact-hq-section">
      <div className="flex items-center gap-2 mb-1">
        <Headset className="w-5 h-5 text-violet-500" />
        <h3 className="font-playfair text-xl text-slate-800">Contact Miracurl HQ</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">Questions, requests or documents for the Miracurl team? Send them here — attachments welcome (up to 3 files, 10MB total).</p>
      <form onSubmit={send} className="space-y-3">
        <input data-testid="hq-subject-input" required minLength={2} maxLength={150} className="input-light w-full"
          placeholder="Subject — e.g. Need help with billing" value={subject} onChange={e => setSubject(e.target.value)} />
        <textarea data-testid="hq-message-input" required minLength={2} rows={4} className="input-light w-full resize-y"
          placeholder="Write your message to the Miracurl team…" value={message} onChange={e => setMessage(e.target.value)} />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 text-xs bg-violet-50 border border-violet-200 text-violet-700 px-2.5 py-1 rounded-full">
                <Paperclip className="w-3 h-3" /> {f.name}
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="hover:text-violet-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" data-testid="hq-attach-btn" onClick={() => fileRef.current?.click()} disabled={files.length >= 3}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            <Paperclip className="w-3.5 h-3.5" /> Attach files
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={pickFiles} data-testid="hq-file-input" />
          <button data-testid="hq-send-btn" disabled={busy} type="submit"
            className="ml-auto inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-semibold hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-60">
            <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send to Miracurl team"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContactHQSection;
