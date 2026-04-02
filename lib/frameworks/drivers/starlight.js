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
    command: 'npx --yes astro dev --host 0.0.0.0 --port 4321',
    port: 4321,
  },
  routing: {
    contentPaths: ['src/content/docs', 'src/components', 'src/layouts', 'src/content/config.ts', 'i18n', 'src/pages', 'src/assets'],
    extensions: ['.md', '.mdx', '.astro', '.ts', '.tsx', '.json']
  },
  content: {
    fileTypes: ['.md', '.mdx', '.astro'],
  }
};
