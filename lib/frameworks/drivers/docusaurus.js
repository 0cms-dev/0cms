/**
 * docusaurus.js
 * Docusaurus Declarative Driver for ZeroCMS.
 */
export default {
  id: 'docusaurus',
  name: 'Docusaurus',
  fingerprint: {
    dependencies: ['@docusaurus/core'],
    configFiles: ['docusaurus.config.']
  },
  server: {
    command: 'npx --yes docusaurus start --host 0.0.0.0 --port 3000',
    port: 3000,
  },
  routing: {
    contentPaths: ['docs', 'blog', 'src', 'i18n', 'sidebars.js', 'docusaurus.config.js'],
    extensions: ['.md', '.mdx', '.js', '.ts', '.tsx', '.json', '.yml']
  },
  content: {
    fileTypes: ['.md', '.mdx'],
  }
};
