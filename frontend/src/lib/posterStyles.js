export const POSTER_STYLES = [
  { key: "pink_glam", label: "💗 Pink Glam" },
  { key: "dark_glam", label: "🖤 Dark Glam" },
  { key: "royal_gold", label: "👑 Royal Gold" },
  { key: "bridal_blush", label: "💍 Bridal Blush" },
  { key: "emerald_luxe", label: "💚 Emerald Luxe" },
  { key: "mens_edge", label: "💈 Men's Edge" },
  { key: "festive_sparkle", label: "✨ Festive Sparkle" },
  { key: "purple_pop", label: "💜 Purple Pop" },
  { key: "rose_wave", label: "🌸 Rose Spa" },
  { key: "navy_classic", label: "🌊 Navy Classic" },
];

export const randomPosterStyle = () =>
  POSTER_STYLES[Math.floor(Math.random() * POSTER_STYLES.length)].key;
