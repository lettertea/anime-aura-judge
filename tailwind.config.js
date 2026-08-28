/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      colors: {
        void: '#09090b',
        abyss: '#0e1017',
      },
      boxShadow: {
        card: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        'accent-glow': '0 0 0 1px rgba(99, 102, 241, 0.2), 0 8px 24px -8px rgba(99, 102, 241, 0.25)',
      },
    },
  },
  plugins: [],
}
