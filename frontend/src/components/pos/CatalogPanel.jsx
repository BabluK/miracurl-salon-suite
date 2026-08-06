function panelTitle(categories, category, mode) {
  if (categories.length) return category || "All items";
  if (mode === "package") return "Packages";
  if (mode === "membership") return "Memberships";
  return "All items";
}

export function CatalogPanel({ mode, categories, category, setCategory, filtered, onAdd, gender = "all", setGender }) {
  return (
    <div className="lg:col-span-5 xl:col-span-4 space-y-4">
      {mode === "services" && setGender && (
        <div className="flex gap-2" data-testid="pos-gender-filter">
          {[{ k: "all", l: "All guests" }, { k: "male", l: "👨 Men" }, { k: "female", l: "👩 Women" }].map(g => (
            <button key={g.k} data-testid={`pos-gender-${g.k}`} onClick={() => setGender(g.k)}
              className={`flex-1 rounded-full py-2 text-xs font-semibold border transition ${
                gender === g.k
                  ? "bg-slate-900 border-slate-900 text-amber-200 shadow"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              {g.l}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {categories.map(c => (
          <button
            key={c}
            data-testid={`pos-category-${c.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => setCategory(c)}
            className={`rounded-xl py-4 px-2 text-xs font-semibold uppercase tracking-wide truncate border transition shadow-sm ${
              category === c
                ? "bg-sky-50 border-sky-400 text-sky-600 ring-2 ring-sky-200"
                : "bg-white border-slate-200 text-slate-600 hover:border-sky-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-700 mb-3">{panelTitle(categories, category, mode)}</h3>
        <div className="grid grid-cols-2 gap-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
          {filtered.map(i => (
            <button
              key={i.id}
              data-testid={`pos-item-${i.id}`}
              onClick={() => onAdd(i)}
              className="text-left rounded-lg border border-slate-200 hover:border-sky-300 hover:shadow-sm transition px-3 py-2.5 flex items-center justify-between gap-2 bg-white"
            >
              <span className="text-sm text-slate-700 line-clamp-2">{i.name}</span>
              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">{i.price}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center text-slate-400 py-8 text-sm">No items in this category</div>
          )}
        </div>
      </div>
    </div>
  );
}
