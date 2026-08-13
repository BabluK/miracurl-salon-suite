import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Blog() {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    document.title = "Salon Growth Blog — Miracurl Suite";
    axios.get(`${API}/public/blog`).then(r => setPosts(r.data.posts)).catch(() => setPosts([]));
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-14">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors" data-testid="blog-back-home">
          <ArrowLeft className="w-4 h-4" /> miracurl-suite.com
        </Link>
        <div className="mt-8 mb-12">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#DFB78C] flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" /> Salon Growth Blog
          </div>
          <h1 className="font-playfair text-4xl sm:text-5xl mt-3">Run a smarter salon.</h1>
          <p className="text-white/50 text-sm mt-3 max-w-xl">Practical, no-fluff guides on bookings, billing, staff and growth — written for Indian salon owners.</p>
        </div>
        {posts === null ? (
          <p className="text-white/40 text-sm">Loading articles…</p>
        ) : posts.length === 0 ? (
          <p className="text-white/40 text-sm">Articles coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map(p => (
              <Link key={p.slug} to={`/blog/${p.slug}`} data-testid={`blog-card-${p.slug}`}
                className="group rounded-3xl bg-[#101011] border border-white/10 p-7 hover:border-[#DFB78C]/40 transition-colors flex flex-col">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(p.tags || []).slice(0, 3).map(t => (
                    <span key={t} className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-[#DFB78C]/30 text-[#DFB78C]/80">{t}</span>
                  ))}
                </div>
                <h2 className="font-playfair text-lg leading-snug group-hover:text-[#DFB78C] transition-colors">{p.title}</h2>
                <p className="text-white/45 text-xs mt-3 leading-relaxed flex-1">{p.excerpt}</p>
                <div className="mt-5 text-xs text-[#DFB78C] flex items-center gap-1.5">
                  Read article <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-16 rounded-3xl border border-[#DFB78C]/25 bg-gradient-to-r from-[#161410] to-[#101011] p-8 text-center">
          <h3 className="font-playfair text-2xl">Ready to put this into practice?</h3>
          <p className="text-white/50 text-sm mt-2">Miracurl Suite automates everything these articles teach — 7-day free trial, no card needed.</p>
          <Link to="/signup-salon" data-testid="blog-cta-signup"
            className="inline-block mt-5 px-8 py-3 rounded-full bg-[#DFB78C] text-black text-sm font-bold hover:bg-[#e8c79f] transition-colors">
            Start free trial ✦
          </Link>
        </div>
      </div>
    </div>
  );
}
