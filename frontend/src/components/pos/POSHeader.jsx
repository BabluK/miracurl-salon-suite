import { Search } from "lucide-react";

const TAB_BUTTONS = [
  { k: "services", label: "Add Service", live: true },
  { k: "products", label: "Add Product", live: true },
  { k: "package", label: "Add Package", live: true },
  { k: "offers", label: "Offers & Plans", live: true },
  { k: "giftcard", label: "🎁 Add GiftCard", live: true, popup: true },
  { k: "membership", label: "Add Membership", live: true },
];

function tabClass(active, live) {
  if (active) return "bg-sky-50 border-sky-300 text-sky-600";
  if (live) return "bg-white border-slate-200 text-slate-700 hover:border-sky-200 hover:text-sky-600";
  return "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed";
}

export function POSHeader({ q, setQ, mode, setMode, onGiftCard }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          data-testid="pos-search"
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          placeholder="Search Service"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2 ml-auto">
        {TAB_BUTTONS.map(b => (
          <button
            key={b.k}
            data-testid={`pos-tab-${b.k}`}
            onClick={() => {
              if (!b.live) return;
              if (b.popup) { onGiftCard?.(); return; }
              setMode(b.k);
            }}
            disabled={!b.live}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${tabClass(mode === b.k, b.live)}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
