/**
 * nuxt.js
 * Nuxt.js Declarative Driver for ZeroCMS.
 * Supports Nuxt 3+ project structures.
 */
export default {
  id: 'nuxt',
  name: 'Nuxt',
  fingerprint: {
    dependencies: ['nuxt'],
  },
  server: {
    command: 'npm run dev', // nuxt dev
    port: 3000,
  },
  routing: {
    contentPaths: ['pages', 'content', 'components'],
  },
  content: {
    fileTypes: ['.vue', '.md', '.json'],
  }
};
