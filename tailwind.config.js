/** Tailwind config for the compiled stylesheet.
 *
 * This replaces the runtime Play CDN (cdn.tailwindcss.com), which Tailwind
 * itself warns against in production: it shipped the whole compiler to every
 * visitor, compiled the CSS on their device, and made the site depend on a third
 * party being reachable. The `theme.extend` block below is the same config that
 * used to sit inline in docs/app/index.html.
 *
 * Regenerate after changing any markup or class names:
 *   npm run build:css      (see package.json)
 *
 * The output, docs/css/tailwind.css, is committed — Netlify just serves docs/
 * and runs no build step, so it must be built here and checked in.
 */
module.exports = {
  darkMode: 'class',
  content: [
    './docs/**/*.html',
    './docs/app/js/*.js', // class names built in template strings
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'ui-sans-serif', 'system-ui'],
        display: ['Syne', 'ui-sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe',
          300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6',
          600: '#7C3AED', 700: '#6d28d9', 800: '#5b21b6',
          900: '#4c1d95', 950: '#2e1065',
        },
      },
    },
  },
};
