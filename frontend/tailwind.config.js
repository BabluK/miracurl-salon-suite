/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        playfair: ['"Playfair Display"', 'serif'],
        outfit: ['Outfit', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        bg: { base: '#0A0A0A', surface: '#121212', hover: '#1A1A1A' },
        gold: { DEFAULT: '#D4AF37', hover: '#F0C847', muted: '#8A7028' },
        blush: { DEFAULT: '#E8C5C8', muted: '#8A6D70' },
        ink: { primary: '#FFFFFF', secondary: '#A1A1AA', muted: '#71717A' },
      },
      boxShadow: {
        'gold-glow': '0 0 24px rgba(212,175,55,0.25)',
        'card-luxe': '0 8px 32px rgba(0,0,0,0.4)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
