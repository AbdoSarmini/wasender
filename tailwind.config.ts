import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#608bfa",
          500: "#3b66f5",
          600: "#2547ea",
          700: "#1d36d6",
          800: "#1e2ead",
          900: "#1e2a89",
        },
      },
    },
  },
  plugins: [],
};

export default config;
