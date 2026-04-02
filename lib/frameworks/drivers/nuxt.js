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
    command: 'npx --yes nuxi dev --host 0.0.0.0 --port 3000',
    port: 3000,
  },
  routing: {
    contentPaths: ['pages', 'components', 'layouts', 'content', 'src/pages', 'src/components', 'src/layouts', 'src/content'],
    extensions: ['.vue', '.js', '.ts', '.md', '.mdx']
  },
  content: {
    fileTypes: ['.vue', '.md', '.mdx'],
  }
};
