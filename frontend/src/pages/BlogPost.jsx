import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft } from "lucide-react";
import { LogoLockup } from "./Landing";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function renderBlock(block, i) {
  if (block.startsWith("## ")) {
    return <h2 key={i} className="font-playfair text-2xl text-white mt-10 mb-3">{block.slice(3)}</h2>;
  }
  const lines = block.split("\n");
  if (lines.every(l => /^(- |\d+\. )/.test(l))) {
    return (
      <ul key={i} className="space-y-2 my-4 pl-1">
        {lines.map((l, j) => (
          <li key={j} className="text-white/70 text-[15px] leading-relaxed flex gap-2.5">
            <span className="text-[#DFB78C] shrink-0">✦</span>
            <span dangerouslySetInnerHTML={{ __html: inline(l.replace(/^(- |\d+\. )/, "")) }} />
          </li>
        ))}
      </ul>
    );
  }
  return <p key={i} className="text-white/70 text-[15px] leading-[1.9] my-4" dangerouslySetInnerHTML={{ __html: inline(block) }} />;
}

function inline(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, '<b class="text-white">$1</b>');
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/blog/${slug}`)
      .then(r => {
        setPost(r.data);
        document.title = `${r.data.title} — Miracurl Blog`;
      })
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">Article not found.</p>
        <Link to="/blog" className="text-[#DFB78C] text-sm" data-testid="blogpost-back">← All articles</Link>
      </div>
    );
  }
  if (!post) return <div className="min-h-screen bg-[#0B0B0C]" />;

  const blocks = post.content.split("\n\n");
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0B0C]/85 backdrop-blur-md" data-testid="blogpost-header">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-3 flex items-center justify-between gap-4">
          <LogoLockup />
          <nav className="flex items-center gap-3 sm:gap-5 text-xs">
            <Link to="/blog" className="hidden sm:inline text-white/60 hover:text-white uppercase tracking-widest transition-colors" data-testid="blogpost-nav-blog">All articles</Link>
            <Link to="/signup-salon" data-testid="blogpost-nav-trial"
              className="px-4 sm:px-5 py-2 rounded-full bg-[#DFB78C] text-black font-bold hover:bg-[#e8c79f] transition-colors whitespace-nowrap">
              Start free trial ✦
            </Link>
          </nav>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-6 sm:px-10 py-12" data-testid="blog-article">
        <Link to="/blog" className="inline-flex items-center gap-2 text-xs text-white/40 hover:text-white transition-colors" data-testid="blogpost-back">
          <ArrowLeft className="w-3.5 h-3.5" /> All articles
        </Link>
        <div className="flex flex-wrap gap-1.5 mt-8">
          {(post.tags || []).map(t => (
            <span key={t} className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-[#DFB78C]/30 text-[#DFB78C]/80">{t}</span>
          ))}
        </div>
        <h1 className="font-playfair text-3xl sm:text-4xl leading-tight mt-4">{post.title}</h1>
        <p className="text-xs text-white/40 mt-3">{post.author} · {new Date(post.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        <div className="mt-6 border-t border-[#DFB78C]/20 pt-2">
          {blocks.map(renderBlock)}
        </div>
        <div className="mt-14 rounded-3xl border border-[#DFB78C]/25 bg-gradient-to-r from-[#161410] to-[#101011] p-8 text-center">
          <h3 className="font-playfair text-xl">Automate this with Miracurl Suite</h3>
          <p className="text-white/50 text-sm mt-2">Bookings, WhatsApp reminders, GST billing, memberships & payroll — one suite, 7-day free trial.</p>
          <Link to="/signup-salon" data-testid="blogpost-cta-signup"
            className="inline-block mt-5 px-8 py-3 rounded-full bg-[#DFB78C] text-black text-sm font-bold hover:bg-[#e8c79f] transition-colors">
            Start free trial ✦
          </Link>
        </div>
      </article>
    </div>
  );
}
