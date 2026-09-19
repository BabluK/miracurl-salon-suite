import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b) => { for (const [a,c,d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return null; };

export function TicTacToe() {
  const [b, setB] = useState(Array(9).fill(null));
  const w = winner(b); const full = b.every(Boolean);
  const play = (i) => {
    if (b[i] || w) return;
    const nb = [...b]; nb[i] = "X";
    if (!winner(nb) && nb.some(x => !x)) {
      const empties = nb.map((v, k) => v ? null : k).filter(k => k !== null);
      const smart = empties.find(k => { const t = [...nb]; t[k] = "O"; return winner(t); })
        ?? empties.find(k => { const t = [...nb]; t[k] = "X"; return winner(t); })
        ?? (nb[4] ? empties[Math.floor(Math.random() * empties.length)] : 4);
      nb[smart] = "O";
    }
    setB(nb);
  };
  return (
    <div className="text-center" data-testid="game-tictactoe">
      <p className="text-sm text-white/70 mb-3">{w ? (w === "X" ? "🎉 You win!" : "🤖 Chef wins this round") : full ? "🤝 It's a draw" : "You are X — beat the chef!"}</p>
      <div className="grid grid-cols-3 gap-2 w-56 mx-auto">
        {b.map((v, i) => (
          <button key={i} onClick={() => play(i)} data-testid={`ttt-cell-${i}`}
            className={`h-16 rounded-xl text-2xl font-bold border ${v === "X" ? "text-gold border-gold/50 bg-gold/10" : v === "O" ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/10"}`}>{v}</button>
        ))}
      </div>
      <button onClick={() => setB(Array(9).fill(null))} className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"><RotateCcw className="w-3.5 h-3.5" /> New game</button>
    </div>
  );
}

const COLORS = ["#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#3b82f6"];
export function BubblePop() {
  const [bubbles, setBubbles] = useState([]);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (left <= 0) return;
    const spawn = setInterval(() => setBubbles(bs => bs.length < 8 ? [...bs, { id: Date.now() + Math.random(), x: 5 + Math.random() * 80, y: 5 + Math.random() * 75, c: COLORS[Math.floor(Math.random() * COLORS.length)], s: 36 + Math.random() * 30 }] : bs), 600);
    const tick = setInterval(() => setLeft(l => l - 1), 1000);
    return () => { clearInterval(spawn); clearInterval(tick); };
  }, [left]);
  const pop = (id) => { setBubbles(bs => bs.filter(b => b.id !== id)); setScore(s => s + 1); };
  const reset = () => { setBubbles([]); setScore(0); setLeft(30); };
  return (
    <div data-testid="game-bubblepop">
      <div className="flex justify-between text-xs text-white/70 mb-2"><span>Score <b className="text-gold">{score}</b></span><span>{left > 0 ? `${left}s left` : "Time's up!"}</span></div>
      <div className="relative h-72 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        {left > 0 ? bubbles.map(b => (
          <button key={b.id} onClick={() => pop(b.id)} style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.s, height: b.s, background: `radial-gradient(circle at 30% 30%, #fff8, ${b.c})` }}
            className="absolute rounded-full shadow-lg active:scale-75 transition-transform" aria-label="bubble" />
        )) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="font-playfair text-2xl text-gold">You popped {score} bubbles! 🎉</p>
            <button onClick={reset} className="px-4 py-2 rounded-full bg-gold text-black text-xs font-bold">Play again</button>
          </div>
        )}
      </div>
    </div>
  );
}
