import { useMemo, useState } from "react";
import { Gamepad2, Clock, Smile, X, RotateCcw, ConciergeBell } from "lucide-react";
import { TicTacToe, BubblePop } from "./games/Arcade";

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** 4×4 mini sudoku: derive a solved grid by permuting digits of a base grid, then blank 8 cells. */
function Sudoku() {
  const build = () => {
    const base = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
    const map = shuffle([1,2,3,4]);
    const sol = base.map(r => r.map(v => map[v - 1]));
    const blanks = new Set(shuffle([...Array(16).keys()]).slice(0, 8));
    return { sol, given: sol.map((r, i) => r.map((v, j) => blanks.has(i * 4 + j) ? 0 : v)) };
  };
  const [{ sol, given }, setPuzzle] = useState(build);
  const [grid, setGrid] = useState(() => given.map(r => [...r]));
  const [sel, setSel] = useState(null);
  const solved = grid.every((r, i) => r.every((v, j) => v === sol[i][j]));
  const reset = () => { const p = build(); setPuzzle(p); setGrid(p.given.map(r => [...r])); setSel(null); };
  const put = (n) => { if (!sel) return; const [i, j] = sel; if (given[i][j]) return; setGrid(g => g.map((r, a) => r.map((v, b) => a === i && b === j ? n : v))); };
  return (
    <div className="text-center" data-testid="game-sudoku">
      <p className="text-sm text-white/70 mb-3">{solved ? "🎉 Solved! Sharp mind." : "Fill 1–4 so each row, column and 2×2 box has every number"}</p>
      <div className="grid grid-cols-4 gap-1 w-56 mx-auto">
        {grid.map((r, i) => r.map((v, j) => {
          const wrong = v && v !== sol[i][j];
          const isSel = sel && sel[0] === i && sel[1] === j;
          return (
            <button key={`${i}${j}`} onClick={() => setSel([i, j])} data-testid={`sudoku-cell-${i}${j}`}
              className={`h-12 rounded-lg text-lg font-bold border ${(i < 2) !== (j < 2) ? "bg-white/[0.02]" : "bg-white/5"} ${isSel ? "border-gold" : "border-white/15"} ${given[i][j] ? "text-white" : wrong ? "text-rose-400" : "text-gold"}`}>{v || ""}</button>
          );
        }))}
      </div>
      <div className="flex justify-center gap-2 mt-3">
        {[1, 2, 3, 4].map(n => <button key={n} onClick={() => put(n)} data-testid={`sudoku-num-${n}`} className="w-11 h-11 rounded-full bg-gold/15 border border-gold/40 text-gold font-bold">{n}</button>)}
        <button onClick={() => put(0)} className="w-11 h-11 rounded-full bg-white/5 border border-white/15 text-white/70 text-xs">clear</button>
      </div>
      <button onClick={reset} className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"><RotateCcw className="w-3.5 h-3.5" /> New puzzle</button>
    </div>
  );
}

/** 3×3 tile-swap jigsaw of a restaurant photo. */
function Jigsaw() {
  const [tiles, setTiles] = useState(() => shuffle([...Array(9).keys()]));
  const [pick, setPick] = useState(null);
  const done = tiles.every((t, i) => t === i);
  const tap = (i) => {
    if (pick === null) { setPick(i); return; }
    setTiles(t => { const n = [...t]; [n[pick], n[i]] = [n[i], n[pick]]; return n; });
    setPick(null);
  };
  return (
    <div className="text-center" data-testid="game-jigsaw">
      <p className="text-sm text-white/70 mb-3">{done ? "🎉 Picture complete!" : "Tap two tiles to swap them and rebuild the picture"}</p>
      <div className="grid grid-cols-3 gap-1 w-60 h-60 mx-auto rounded-xl overflow-hidden">
        {tiles.map((t, i) => (
          <button key={i} onClick={() => tap(i)} data-testid={`jigsaw-tile-${i}`}
            className={`bg-cover ${pick === i ? "ring-2 ring-gold scale-95" : ""} transition-transform`}
            style={{ backgroundImage: "url(/assets/login/restaurant.jpg)", backgroundSize: "300% 300%", backgroundPosition: `${(t % 3) * 50}% ${Math.floor(t / 3) * 50}%` }} />
        ))}
      </div>
      <button onClick={() => { setTiles(shuffle([...Array(9).keys()])); setPick(null); }} className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"><RotateCcw className="w-3.5 h-3.5" /> Shuffle</button>
    </div>
  );
}

const GAMES = [
  { key: "sudoku", label: "Sudoku", emoji: "🔢", bg: "from-blue-500 to-indigo-600", C: Sudoku },
  { key: "jigsaw", label: "Jigsaw", emoji: "🧩", bg: "from-emerald-500 to-teal-700", C: Jigsaw },
  { key: "pop", label: "Bubble Pop", emoji: "🫧", bg: "from-violet-500 to-purple-700", C: BubblePop },
  { key: "ttt", label: "Tic Tac Toe", emoji: "⭕", bg: "from-amber-400 to-orange-500", C: TicTacToe },
];

/** "Waiting for your delicious food?" panel — shown after the diner has waited ~10 minutes. */
export function WaitGames({ salon }) {
  const [open, setOpen] = useState(null);
  const G = useMemo(() => GAMES.find(g => g.key === open), [open]);
  return (
    <div className="relative rounded-3xl border border-gold/30 overflow-hidden mt-6 animate-fade-up" data-testid="wait-games-panel">
      <img src="/assets/login/restaurant.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0a09]/70 via-[#0b0a09]/85 to-[#0b0a09] pointer-events-none" />
      <div className="relative p-5">
        {G ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-sm text-gold">{G.emoji} {G.label}</p>
              <button onClick={() => setOpen(null)} data-testid="wait-games-close" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <G.C />
          </>
        ) : (
          <>
            <div className="flex justify-end"><p className="font-caveat text-gold text-lg leading-tight text-right">Good Food<br />Brings People Together ♡</p></div>
            <h3 className="font-playfair text-[32px] leading-[1.05] -mt-2">Waiting for your<br /><span className="text-gold">Delicious Food?</span></h3>
            <p className="text-white/85 text-base mt-3">While we are preparing your order, how about a quick game? 😊</p>
            <div className="flex items-center gap-3 mt-4 text-[12px] text-white/80">
              {[[Gamepad2, "Play\nGames"], [Clock, "Pass\nTime"], [Smile, "Stay\nHappy"]].map(([I, l], i) => (
                <div key={l} className={`flex flex-col items-center gap-1 px-3 ${i ? "border-l border-white/15" : ""}`}><I className="w-6 h-6 text-gold" /><span className="whitespace-pre text-center leading-tight">{l}</span></div>
              ))}
              <div className="ml-auto font-caveat text-gold text-lg leading-tight text-center rounded-2xl border border-gold/40 px-3 py-1.5">Good Things<br />Take Time ♡</div>
            </div>
            <div className="relative mt-3 -mx-5">
              <img src="/assets/order/wait-boy.jpg" alt="Guest enjoying a game while waiting" className="w-full h-56 object-cover object-top" style={{ WebkitMaskImage: "linear-gradient(180deg,#000 70%,transparent)", maskImage: "linear-gradient(180deg,#000 70%,transparent)" }} />
            </div>
            <button onClick={() => setOpen("ttt")} data-testid="wait-games-play-now" className="-mt-8 relative w-full py-3.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-black font-bold flex items-center justify-center gap-2 shadow-xl"><Gamepad2 className="w-5 h-5" /> Play a Game Now →</button>
            <p className="text-center text-xs text-white/50 mt-2">Make your wait more fun!</p>
            <div className="grid grid-cols-4 gap-2.5 mt-4">
              {GAMES.map(g => (
                <button key={g.key} onClick={() => setOpen(g.key)} data-testid={`wait-game-${g.key}`}
                  className={`rounded-2xl bg-gradient-to-br ${g.bg} aspect-square flex flex-col items-center justify-center gap-1.5 text-white shadow-lg active:scale-95 transition-transform`}>
                  <span className="text-3xl leading-none">{g.emoji}</span>
                  <span className="font-bold text-[11px] leading-tight text-center px-1">{g.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center gap-3 text-sm">
              <ConciergeBell className="w-7 h-7 text-gold shrink-0" />
              <p className="text-white/85">Our chefs are working hard to serve you the best food. <span className="text-gold">♡</span></p>
            </div>
            <p className="text-center text-[10px] tracking-[0.3em] uppercase text-white/60 mt-5">{salon?.name}</p>
            <p className="text-center text-[9px] tracking-[0.25em] uppercase text-white/40 mt-1">Good food • Great company • Always a reason to smile</p>
          </>
        )}
      </div>
    </div>
  );
}
