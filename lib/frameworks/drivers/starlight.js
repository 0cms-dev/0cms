/**
 * starlight.js
 * Starlight (Astro) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'starlight',
  name: 'Starlight',
  fingerprint: {
    dependencies: ['@astrojs/starlight'],
  },
  server: {
    command: 'npx --yes astro dev --port 4321',
    port: 4321,
  },
  routing: {
    contentPaths: ['src/content/docs', 'i18n'],
  },
  content: {
    fileTypes: ['.md', '.mdx'],
  }
};
