import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "c9-green": "#6DB832",
        "c9-purple": "#7A2FA8",
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
