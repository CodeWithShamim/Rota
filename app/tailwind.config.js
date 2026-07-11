/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Bengali", "system-ui", "sans-serif"],
      },
      keyframes: {
        orbit: { to: { transform: "rotate(360deg)" } },
        "orbit-reverse": { to: { transform: "rotate(-360deg)" } },
        "hero-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        orbit: "orbit 44s linear infinite",
        "orbit-reverse": "orbit-reverse 44s linear infinite",
        "hero-float": "hero-float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
