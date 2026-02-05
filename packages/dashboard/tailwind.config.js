/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#0f1117",
          card: "#1a1d2e",
          border: "#2a2d3e",
          text: "#e1e4ed",
          muted: "#8b8fa3",
        },
      },
    },
  },
  plugins: [],
};
