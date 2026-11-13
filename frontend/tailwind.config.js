/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Referenced from the components as font-['Bricolage_Grotesque'] and
        // font-['Instrument_Sans']; loaded from Google Fonts in index.css.
        "Bricolage_Grotesque": ["'Bricolage Grotesque'", "sans-serif"],
        "Instrument_Sans": ["'Instrument Sans'", "sans-serif"],
      },
    },
  },
  plugins: [],
};