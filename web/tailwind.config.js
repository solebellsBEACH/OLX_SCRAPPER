/** @type {import('tailwindcss').Config} */
// Convenções seguindo o openstatus (data-table + tokens neutros): paleta neutra,
// borda de 1px, raio pequeno, um acento só. Escala de espaçamento travada em
// 4 8 12 16 24 32 48 — nada fora disso.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Espaçamento fixo — remove o resto para não haver como sair da escala.
    spacing: {
      0: "0px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      6: "24px",
      8: "32px",
      12: "48px",
    },
    borderRadius: {
      none: "0px",
      sm: "4px",
      DEFAULT: "5px",
      md: "6px",
      full: "9999px",
    },
    fontSize: {
      xs: ["12px", "16px"],
      sm: ["13px", "18px"],
      base: ["14px", "20px"],
      lg: ["20px", "28px"],
    },
    fontWeight: {
      normal: "400",
      semibold: "600",
    },
    extend: {
      // Valores em index.css (claro/escuro), como canais RGB.
      colors: {
        "bg": "rgb(var(--bg) / <alpha-value>)",
        "surface": "rgb(var(--surface) / <alpha-value>)",
        "border": "rgb(var(--border) / <alpha-value>)",
        "fg": "rgb(var(--fg) / <alpha-value>)",
        "muted": "rgb(var(--muted) / <alpha-value>)",
        "subtle": "rgb(var(--subtle) / <alpha-value>)",
        "accent": "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        "accent-weak": "rgb(var(--accent-weak) / <alpha-value>)",
        "accent-border": "rgb(var(--accent-border) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "accent-weak-hover": "rgb(var(--accent-weak-hover) / <alpha-value>)",
        "ok": "rgb(var(--ok) / <alpha-value>)",
        "ok-bg": "rgb(var(--ok-bg) / <alpha-value>)",
        "ok-border": "rgb(var(--ok-border) / <alpha-value>)",
        "warn": "rgb(var(--warn) / <alpha-value>)",
        "warn-bg": "rgb(var(--warn-bg) / <alpha-value>)",
        "warn-border": "rgb(var(--warn-border) / <alpha-value>)",
        "danger": "rgb(var(--danger) / <alpha-value>)",
        "danger-bg": "rgb(var(--danger-bg) / <alpha-value>)",
        "danger-border": "rgb(var(--danger-border) / <alpha-value>)",
        "danger-hover": "rgb(var(--danger-hover) / <alpha-value>)",
        "caution-bg": "rgb(var(--caution-bg) / <alpha-value>)",
        "caution-border": "rgb(var(--caution-border) / <alpha-value>)",
        "caution-fg": "rgb(var(--caution-fg) / <alpha-value>)",
        "orange-bg": "rgb(var(--orange-bg) / <alpha-value>)",
        "orange-border": "rgb(var(--orange-border) / <alpha-value>)",
        "orange-fg": "rgb(var(--orange-fg) / <alpha-value>)",
        "tip-bg": "rgb(var(--tip-bg) / <alpha-value>)",
        "tip-fg": "rgb(var(--tip-fg) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      keyframes: {
        fadeIn: { from: { opacity: "0", transform: "translateY(2px)" }, to: { opacity: "1", transform: "none" } },
        popIn: { from: { opacity: "0", transform: "scale(0.96) translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        slideDown: { from: { opacity: "0", transform: "translateY(-6px)" }, to: { opacity: "1", transform: "none" } },
        slideInLeft: { from: { opacity: "0", transform: "translateX(-8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "pop-in": "popIn 180ms ease-out",
        "slide-down": "slideDown 220ms ease-out",
        "slide-in-left": "slideInLeft 260ms ease-out both",
      },
      transitionDuration: {
        DEFAULT: "130ms",
      },
      boxShadow: {
        popover: "0 2px 8px rgba(0,0,0,0.08)",
        card: "0 2px 8px rgba(0,0,0,0.1)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.15)",
      },
    },
  },
  plugins: [],
};
