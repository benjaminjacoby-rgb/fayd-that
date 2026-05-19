import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bg2: "var(--bg2)",
        bg3: "var(--bg3)",
        bg4: "var(--bg4)",
        text: "var(--text)",
        text2: "var(--text2)",
        text3: "var(--text3)",
        yes: "var(--yes)",
        no: "var(--no)",
        blue: "var(--blue)",
        orange: "var(--orange)",
        purple: "var(--purple)",
        gold: "var(--gold)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
        input: "8px",
        pill: "99px",
      },
      maxWidth: {
        app: "430px",
      },
    },
  },
  plugins: [],
};

export default config;
