import { X } from "lucide-react";
import { thumbUrl } from "@/lib/api";

export function DishPhotoLightbox({ dish, onClose }) {
  if (!dish) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-5"
      onClick={onClose} data-testid="dish-photo-lightbox">
      <div className="w-full max-w-sm rounded-3xl overflow-hidden border border-gold/30 bg-[#16120c] shadow-2xl animate-fade-up"
        onClick={e => e.stopPropagation()}>
        <div className="relative">
          <img src={thumbUrl(dish.image_url, 800)} alt={dish.name} data-testid="dish-photo-large"
            className="w-full aspect-square object-cover" />
          <button onClick={onClose} data-testid="dish-photo-close" aria-label="Close photo"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center border border-white/20 hover:bg-black/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-white truncate" data-testid="dish-photo-name">{dish.name}</p>
            {dish.description && <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{dish.description}</p>}
          </div>
          <span className="text-gold font-bold shrink-0">₹{Math.round(dish.price)}</span>
        </div>
      </div>
    </div>
  );
}
