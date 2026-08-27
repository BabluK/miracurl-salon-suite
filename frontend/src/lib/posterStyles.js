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

export const FESTIVAL_STYLES = [
  { key: "diwali_lights", label: "🪔 Diwali Diyas & Rangoli" },
  { key: "holi_splash", label: "🎨 Holi Colour Splash" },
  { key: "ganesh_blessings", label: "🐘 Ganesh Chaturthi" },
  { key: "rakhi_bond", label: "🪢 Raksha Bandhan" },
  { key: "navratri_dandiya", label: "💃 Navratri Dandiya" },
  { key: "christmas_glow", label: "🎄 Christmas Glow" },
  { key: "eid_elegance", label: "🌙 Eid Elegance" },
  { key: "valentine_rose", label: "❤️ Valentine Rose" },
];

export const randomPosterStyle = () =>
  POSTER_STYLES[Math.floor(Math.random() * POSTER_STYLES.length)].key;
