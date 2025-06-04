/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // If you use the `pages` directory
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}', // IMPORTANT: This covers your `app/page.tsx`
    './src/**/*.{js,ts,jsx,tsx,mdx}', // If you have a `src` directory (common in some setups)
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-radial':
          'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}