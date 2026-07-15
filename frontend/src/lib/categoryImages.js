// Default category banner images (AI-curated) — used on the admin Service Menu
// and the public booking page. Owners can override per category from Services page.
const BASE = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images";

export const DEFAULT_CATEGORY_IMAGES = {
  Skin: `${BASE}/b9b346fbdc8b72b843be2bb4d9e7edfd4845f57340b556d4ca50fc42a2185cb8.png`,
  Manicure: `${BASE}/ea6d5bfe701e4b4adb922c144cc3a8a74ab89abf572f97e3459fe46adb5a332f.png`,
  Pedicure: `${BASE}/e84e842022df0ea96d4672edadf42e68f29d33e514fb396eedbeb4514f242eee.png`,
  "Men Hair": `${BASE}/df55cefd12cbc24c79e1780e7a1acddaa18c692b165e5cee80d369981fb0f0a9.png`,
  "Women Hair": `${BASE}/5595bde12470b663627694af3db4f59c2c464295e122cd440a5170c65c8763ed.png`,
  Makeup: `${BASE}/ab993142df136ac54c56bb5f3f54b84c84d7647d95a3db542d26b7d00ee32d13.png`,
  Nails: `${BASE}/c1baa0d6f4f9e710f7db4f36563a5b4e2d9c023529790329502c5a193f54b244.png`,
};

export const GENERIC_CATEGORY_IMAGE = `${BASE}/c9448b552758379e042f334e5db49ea87d597ab1dfe7f258b69ad0faa04a32e3.png`;

export function catImage(cat, overrides = {}) {
  return overrides?.[cat] || DEFAULT_CATEGORY_IMAGES[cat] || GENERIC_CATEGORY_IMAGE;
}
