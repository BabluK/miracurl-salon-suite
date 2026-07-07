import { Sunrise, Disc3, Coffee, Flame, PartyPopper, Globe2 } from "lucide-react";

// Browser-verified embeddable YouTube IDs (Jul 2026). Spotify optional per channel.
export const MUSIC_CHANNELS = [
  { id: "bhakti", label: "Morning Bhakti", desc: "Devotional bhajans to open the day on a divine note", yt: "ZD72mEhB6TE", spotify: "1osTTfhMyThJE1AqNRjZSw", icon: Sunrise, tint: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "nineties", label: "90's Bollywood", desc: "Evergreen Kumar Sanu–era romantic jukebox", yt: "-sbKzeFczbw", spotify: "", icon: Disc3, tint: "bg-teal-100 text-teal-700 border-teal-200" },
  { id: "chill", label: "Bollywood & Chill", desc: "24/7 lofi Bollywood mashups for a calm salon vibe", yt: "6SMpIcjJ17M", spotify: "37i9dQZF1DWX76Z8XDsZzF", icon: Coffee, tint: "bg-sky-100 text-sky-700 border-sky-200" },
  { id: "hits", label: "Bollywood Hot Hits", desc: "Live stream of the best Hindi chartbusters", yt: "IYuhfdw8_yc", spotify: "37i9dQZF1DX0XUfTFmNBRM", icon: Flame, tint: "bg-rose-100 text-rose-700 border-rose-200" },
  { id: "party", label: "Party / Dance", desc: "High-energy jukebox for busy weekend hours", yt: "CbPZ0ittAxg", spotify: "4nNVfQ9eWidZXkBKZN5li4", icon: PartyPopper, tint: "bg-violet-100 text-violet-700 border-violet-200" },
  { id: "hollywood", label: "Hollywood / English", desc: "24/7 live radio of global pop hits", yt: "t5eEz41JbYo", spotify: "37i9dQZF1DXcBWIGoYBM5M", icon: Globe2, tint: "bg-indigo-100 text-indigo-700 border-indigo-200" },
];

export function playPayload(c, source = "youtube") {
  const src = source === "spotify" && c.spotify ? "spotify" : "youtube";
  return {
    id: c.id, label: c.label, kind: src,
    media_type: src === "youtube" ? "video" : "playlist",
    media_id: src === "youtube" ? c.yt : c.spotify,
  };
}
