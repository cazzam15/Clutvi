/** Tailwind config for the compiled stylesheet.
 *
 * This replaces the runtime Play CDN (cdn.tailwindcss.com), which Tailwind
 * itself warns against in production: it shipped the whole compiler to every
 * visitor, compiled the CSS on their device, and made the site depend on a third
 * party being reachable.
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
        sans:    ['Source Sans 3', 'ui-sans-serif', 'system-ui'],
        display: ['Newsreader', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50:  '#F4EFE6',
          100: '#E8E0D2',
          200: '#C9C0B2',
          500: '#C23A22',
          600: '#A32F1C',
          900: '#1C1915',
          950: '#141210',
        },
      },
    },
  },
};
