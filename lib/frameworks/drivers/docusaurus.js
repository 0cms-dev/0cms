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
    command: 'npm run start', // docusaurus start
    port: 3000,
  },
  routing: {
    contentPaths: ['docs', 'blog', 'src/pages'],
  },
  content: {
    fileTypes: ['.md', '.mdx', '.json'],
  }
};
