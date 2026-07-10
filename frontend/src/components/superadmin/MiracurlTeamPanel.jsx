import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Crown, Plus, Trash2, FileDown, Pencil, X } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";

const EMPTY = { name: "", designation: "", phone: "", email: "", blood_group: "", photo_url: "" };
const BLOODS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const MiracurlTeamPanel = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/super/team");
      setMembers(data.members || []);
    } catch { toast.error("Couldn't load team"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function prefillCeo() {
    setEditing(null);
    setForm({ ...EMPTY, name: user?.name || "", email: user?.email || "", designation: "CEO & Entrepreneur" });
    toast.info("CEO details pre-filled — add your phone & photo, then save ✦");
  }

  function startEdit(m) {
    setEditing(m);
    setForm({ name: m.name || "", designation: m.designation || "", phone: m.phone || "", email: m.email || "", blood_group: m.blood_group || "", photo_url: m.photo_url || "" });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/super/team/${editing.id}`, form);
        toast.success(`${form.name} updated ✦`);
      } else {
        const { data } = await api.post("/super/team", form);
        toast.success(`${form.name} added to the Miracurl team ✦ ID: ${data.member_code}`);
      }
      setForm(EMPTY); setEditing(null); load();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(" · ") : "Save failed");
    } finally { setSaving(false); }
  }

  async function remove(m) {
    if (!window.confirm(`Remove ${m.name} from the Miracurl team?`)) return;
    try { await api.delete(`/super/team/${m.id}`); toast.success("Removed"); load(); }
    catch { toast.error("Delete failed"); }
  }

  return (
    <div className="space-y-6" data-testid="miracurl-team-panel">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-2"><Crown className="w-7 h-7 text-rose-500" /> Miracurl Team</h1>
          <p className="text-slate-500 text-sm mt-1">Your own HQ team — CEO, sales, support. Each member gets a rose-gold Miracurl company ID card with your logo.</p>
        </div>
        <button data-testid="team-add-ceo-btn" onClick={prefillCeo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100">
          <Crown className="w-4 h-4" /> Add myself as CEO
        </button>
      </div>

      <form onSubmit={save} className="card-light space-y-4" data-testid="team-form">
        {editing && (
          <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-xs text-sky-800">
            <span>Editing <b>{editing.name}</b> ({editing.member_code})</span>
            <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="text-sky-600 hover:text-sky-800"><X className="w-4 h-4" /></button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-light block mb-1">Name *</label>
            <input data-testid="team-name-input" required minLength={2} className="input-light" value={form.name} onChange={set("name")} placeholder="Bablu Kumar" />
          </div>
          <div>
            <label className="label-light block mb-1">Designation *</label>
            <input data-testid="team-designation-input" required minLength={2} className="input-light" value={form.designation} onChange={set("designation")} placeholder="CEO & Entrepreneur / Sales Manager…" />
          </div>
          <div>
            <label className="label-light block mb-1">Phone</label>
            <input data-testid="team-phone-input" className="input-light" value={form.phone} onChange={set("phone")} placeholder="98…" />
          </div>
          <div>
            <label className="label-light block mb-1">Email</label>
            <input data-testid="team-email-input" type="email" className="input-light" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label-light block mb-1">Blood Group</label>
            <select data-testid="team-blood-input" className="input-light" value={form.blood_group} onChange={set("blood_group")}>
              <option value="">— Not set —</option>
              {BLOODS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="label-light block mb-1">Photo</label>
            <ImageUploader value={form.photo_url} onChange={(url) => setForm(f => ({ ...f, photo_url: url }))} kind="misc" circular />
          </div>
        </div>
        <button data-testid="team-save-btn" type="submit" disabled={saving} className="btn-blue flex items-center gap-2">
          <Plus className="w-4 h-4" /> {saving ? "Saving…" : editing ? "Save changes" : "Add team member"}
        </button>
      </form>

      <div className="card-light p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-sm font-semibold text-slate-700">Team members ({members.length})</div>
        {loading ? <div className="text-slate-400 py-8 text-center">Loading…</div> : members.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm" data-testid="team-empty">No team members yet — start with &ldquo;Add myself as CEO&rdquo; ✦</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center gap-3" data-testid={`team-row-${m.id}`}>
                <img src={m.photo_url || "https://ui-avatars.com/api/?background=ffe4e6&color=9f1239&name=" + encodeURIComponent(m.name)} alt="" className="w-10 h-10 rounded-full object-cover border border-rose-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{m.name}</span>
                    <span className="text-xs font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{m.member_code}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-100 to-pink-50 text-rose-700 border border-rose-300">✦ Miracurl HQ</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {m.designation}{m.phone ? ` · +${m.phone}` : ""}{m.blood_group ? ` · ${m.blood_group}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a href={`${API}/super/team/${m.id}/id-card.pdf`} target="_blank" rel="noreferrer" data-testid={`team-idcard-${m.id}`}
                    className="text-xs py-1.5 px-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 inline-flex items-center gap-1" title="Download Miracurl company ID card">
                    <FileDown className="w-3 h-3" /> ID Card
                  </a>
                  <button data-testid={`team-edit-${m.id}`} onClick={() => startEdit(m)} className="p-1.5 text-slate-500 hover:text-sky-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button data-testid={`team-delete-${m.id}`} onClick={() => remove(m)} className="p-1.5 text-slate-400 hover:text-red-500" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
