/** Detour design tokens: the colours, fonts and shadows every page shares. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f6f4ee', // warm off-white page background
        ink: '#1c2421', // main text
        muted: '#69736e', // secondary text
        line: '#e5e1d6', // thin borders
        forest: {
          50: '#eef4f0',
          100: '#dbe8df',
          200: '#b9d2c2',
          300: '#8fb5a0',
          400: '#679780',
          500: '#487b63',
          600: '#386250',
          700: '#2b5a46',
          800: '#1f4a3a', // primary
          900: '#163a2e', // primary, hovered
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,36,33,.04), 0 4px 16px rgba(28,36,33,.05)',
        lift: '0 8px 28px rgba(28,36,33,.12)',
      },
    },
  },
  plugins: [],
};
