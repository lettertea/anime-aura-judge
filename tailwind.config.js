/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0a0612',
        abyss: '#140b24',
        aura: {
          purple: '#a855f7',
          pink: '#ec4899',
          neon: '#d946ef',
        },
      },
      boxShadow: {
        glow: '0 0 20px rgba(168, 85, 247, 0.4)',
        'glow-pink': '0 0 20px rgba(236, 72, 153, 0.4)',
      },
    },
  },
  plugins: [],
}
