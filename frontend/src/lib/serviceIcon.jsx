import { Scissors, Flower2, Gem, Palette, Sparkles, Droplets, Wind, Waves, Eye, Footprints, Hand, Feather, Wand2, Baby, Sun, Leaf, Crown, Brush } from "lucide-react";

export function NailPolish(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6v4H9z" /><path d="M10 7v3" /><path d="M14 7v3" />
      <path d="M7 12a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
      <path d="M7 15h10" />
    </svg>
  );
}

const RULES = [
  [/pedicure|foot|feet/, Footprints],
  [/manicure|nail|polish|gel|acrylic/, NailPolish],
  [/rose|floral|flower|petal|bloom/, Flower2],
  [/diamond|premium|luxury|platinum|signature|o3|royal|gold/, Gem],
  [/bridal|bride|wedding|party|makeup|make-up|make up/, Crown],
  [/colou?r|highlight|balayage|dye|toner|ombre|global/, Palette],
  [/cut|trim|hair ?cut|shave|beard|fade/, Scissors],
  [/kid|child|baby/, Baby],
  [/spa|massage|relax|head/, Hand],
  [/facial|clean ?up|glow|skin|peel|d-?tan|detan/, Sparkles],
  [/wax|threading|thread|laser|hair removal/, Feather],
  [/keratin|smooth|straight|botox|treatment|repair|nanoplast|rebond/, Droplets],
  [/blow|dry|iron|style|styling/, Wind],
  [/curl|wave|perm/, Waves],
  [/brow|lash|eye/, Eye],
  [/mehendi|mehndi|henna|tattoo|art/, Brush],
  [/tan|sun|bronze/, Sun],
  [/herbal|ayur|organic|natural|green/, Leaf],
  [/magic|wand|transform|makeover/, Wand2],
];

export function serviceIcon(service) {
  const key = `${service?.name || ""} ${service?.category || ""}`.toLowerCase();
  const hit = RULES.find(([rx]) => rx.test(key));
  return hit ? hit[1] : null;
}

export function ServiceGlyph({ service, className = "w-5 h-5" }) {
  const Icon = serviceIcon(service);
  if (!Icon) return <span className="font-playfair">{(service?.name || "?").trim().slice(0, 1).toUpperCase()}</span>;
  return <Icon className={className} strokeWidth={1.5} />;
}
