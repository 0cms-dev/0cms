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
    command: 'remix dev',
    port: 3000,
  },
  routing: {
    contentPaths: ['app/routes'],
  },
  content: {
    fileTypes: ['.jsx', '.tsx', '.md'],
  }
};
