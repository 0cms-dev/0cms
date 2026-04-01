/**
 * gatsby.js
 * Gatsby Declarative Driver for ZeroCMS.
 */
export default {
  id: 'gatsby',
  name: 'Gatsby',
  fingerprint: {
    dependencies: ['gatsby'],
  },
  server: {
    command: 'npx gatsby develop',
    port: 8000,
  },
  routing: {
    contentPaths: ['src/pages', 'src/templates'],
  },
  content: {
    fileTypes: ['.js', '.jsx', '.tsx', '.md'],
  }
};
