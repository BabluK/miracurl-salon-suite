import { Sunrise, Disc3, Coffee, Flame, PartyPopper, Globe2, Leaf, Waves, Sparkles } from "lucide-react";

// Browser-verified embeddable YouTube IDs (Jul 2026). Spotify optional per channel.
export const MUSIC_CHANNELS = [
  // Instrumental moods (no label music → safe to autoplay right after the tap)
  { id: "relaxing", label: "Relaxing", desc: "Sunny-morning piano, guitar & birdsong — calm instrumental", yt: "hlWiI4xVXKY", spotify: "37i9dQZF1DWZqd5JICZI0u", icon: Leaf, tint: "bg-lime-100 text-lime-700 border-lime-200", instrumental: true },
  { id: "spa", label: "Spa Vibes", desc: "Soft piano with gentle water sounds — pure spa ambience", yt: "77ZozI0rw7w", spotify: "37i9dQZF1DX1s9knjP51Oa", icon: Waves, tint: "bg-cyan-100 text-cyan-700 border-cyan-200", instrumental: true },
  { id: "positive", label: "Positive Energy", desc: "Uplifting peaceful piano radio — bright, focused, feel-good", yt: "4oStw0r33so", spotify: "37i9dQZF1DX3Ogo9pFvBkY", icon: Sparkles, tint: "bg-amber-100 text-amber-700 border-amber-200", instrumental: true },
  { id: "bhakti", label: "Morning Bhakti", desc: "Bhajans & Bollywood bhakti songs — a divine start to the day", yt: "ZD72mEhB6TE", spotify: "1osTTfhMyThJE1AqNRjZSw", icon: Sunrise, tint: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "nineties", label: "90's Bollywood", desc: "Evergreen Kumar Sanu–era romantic jukebox", yt: "-sbKzeFczbw", spotify: "", icon: Disc3, tint: "bg-teal-100 text-teal-700 border-teal-200" },
  { id: "chill", label: "Bollywood & Chill", desc: "24/7 lofi Bollywood mashups for a calm salon vibe", yt: "6SMpIcjJ17M", spotify: "37i9dQZF1DWX76Z8XDsZzF", icon: Coffee, tint: "bg-sky-100 text-sky-700 border-sky-200" },
  { id: "hits", label: "Bollywood Hot Hits", desc: "Live stream of the best Hindi chartbusters", yt: "fS-lamSWb4o", spotify: "37i9dQZF1DX0XUfTFmNBRM", icon: Flame, tint: "bg-rose-100 text-rose-700 border-rose-200" },
  { id: "party", label: "Party / Dance", desc: "High-energy jukebox for busy weekend hours", yt: "CbPZ0ittAxg", spotify: "4nNVfQ9eWidZXkBKZN5li4", icon: PartyPopper, tint: "bg-violet-100 text-violet-700 border-violet-200" },
  { id: "hollywood", label: "Hollywood / English", desc: "24/7 live radio of global pop hits", yt: "t5eEz41JbYo", spotify: "37i9dQZF1DXcBWIGoYBM5M", icon: Globe2, tint: "bg-indigo-100 text-indigo-700 border-indigo-200" },
];

export function playPayload(c, source = "youtube") {
  const src = source === "spotify" && c.spotify ? "spotify" : "youtube";
  return {
    id: c.id, label: c.label, kind: src, autoplay: !!c.instrumental,
    media_type: src === "youtube" ? "video" : "playlist",
    media_id: src === "youtube" ? c.yt : c.spotify,
  };
}

// Morning Bhakti window: 6:00–11:00 AM IST — bhakti channel is auto-promoted first.
export function isBhaktiTime() {
  const istHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return istHour >= 6 && istHour < 11;
}

// Channels in display order — bhakti pinned first during the morning window.
export const MOOD_IDS = ["relaxing", "spa", "positive"];
export const moodChannels = () => MUSIC_CHANNELS.filter(c => MOOD_IDS.includes(c.id));

export function orderedChannels() {
  if (!isBhaktiTime()) return MUSIC_CHANNELS;
  return [...MUSIC_CHANNELS].sort((a, b) => (a.id === "bhakti" ? -1 : b.id === "bhakti" ? 1 : 0));
}
