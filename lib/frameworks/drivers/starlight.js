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
    command: 'npx astro dev',
    port: 4321,
  },
  routing: {
    contentPaths: ['src/content/docs'],
  },
  content: {
    fileTypes: ['.md', '.mdx'],
  }
};
