/**
 * docusaurus.js
 * Docusaurus Declarative Driver for ZeroCMS.
 */
export default {
  name: 'Docusaurus',
  fingerprint: {
    dependencies: ['@docusaurus/core'],
  },
  server: {
    command: 'npx --yes docusaurus start --host 0.0.0.0 --port 3000',
    port: 3000,
  },
  routing: {
    contentPaths: ['docs', 'blog', 'src/pages', 'i18n', 'src'],
    extensions: ['.md', '.mdx', '.js', '.ts', '.tsx']
  },
  content: {
    fileTypes: ['.md', '.mdx', '.json'],
  }
};
