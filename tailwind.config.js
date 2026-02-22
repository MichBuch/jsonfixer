/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a', // Dark Slate
        surface: '#1e293b',    // Lighter Slate
        primary: '#22d3ee',    // Neon Cyan
        primaryGlow: 'rgba(34, 211, 238, 0.4)',
        secondary: '#a855f7',  // Neon Purple
        secondaryGlow: 'rgba(168, 85, 247, 0.4)',
        accent: '#f472b6',     // Neon Pink
        success: '#4ade80',    // Neon Green
        warning: '#facc15',    // Neon Yellow
        error: '#f87171',      // Neon Red
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'neon-cyan': '0 0 5px #22d3ee, 0 0 10px rgba(34, 211, 238, 0.4)',
        'neon-purple': '0 0 5px #a855f7, 0 0 10px rgba(168, 85, 247, 0.4)',
        'neon-pink': '0 0 5px #f472b6, 0 0 10px rgba(244, 114, 182, 0.4)',
      },
    },
  },
  plugins: [],
}
