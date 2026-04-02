/**
 * remix.js
 * Remix Declarative Driver for ZeroCMS.
 */
export default {
  name: 'Remix',
  fingerprint: {
    dependencies: ['@remix-run/react'],
  },
  server: {
    command: 'npx --yes remix dev --manual --port 3000',
    port: 3000,
  },
  routing: {
    contentPaths: ['app/routes', 'app/components', 'app/layouts', 'content'],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.md', '.mdx']
  },
  content: {
    fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.md', '.mdx'],
  }
};
