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
      colors: {
        bg: "#fafafa",
        surface: "#ffffff",
        border: "#e5e5e5",
        fg: "#1a1a1a",
        muted: "#6b6b6b",
        subtle: "#9a9a9a",
        accent: "#2563eb",
        "accent-fg": "#ffffff",
        "accent-weak": "#eff4ff",
        ok: "#15803d",
        warn: "#b45309",
        danger: "#b91c1c",
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
      },
      animation: { "fade-in": "fadeIn 200ms ease-out" },
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
