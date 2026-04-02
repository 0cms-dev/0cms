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
    command: 'npx --yes gatsby develop --host 0.0.0.0 --port 8000',
    port: 8000,
  },
  routing: {
    contentPaths: ['src/pages', 'src/templates', 'src/components', 'content', 'data'],
    extensions: ['.js', '.jsx', '.tsx', '.md', '.mdx', '.json']
  },
  content: {
    fileTypes: ['.js', '.jsx', '.tsx', '.md', '.mdx'],
  }
};
