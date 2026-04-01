/**
 * solidstart.js
 * SolidStart Declarative Driver for ZeroCMS.
 */
export default {
  id: 'solidstart',
  name: 'SolidStart',
  fingerprint: {
    dependencies: ['@solidjs/start'],
  },
  server: {
    command: 'npm run dev',
    port: 3000,
  },
  routing: {
    contentPaths: ['src/routes'],
  },
  content: {
    fileTypes: ['.tsx', '.jsx', '.md'],
  }
};
