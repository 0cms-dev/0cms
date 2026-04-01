/**
 * vitepress.js
 * VitePress Declarative Driver for ZeroCMS.
 */
export default {
  id: 'vitepress',
  name: 'VitePress',
  fingerprint: {
    dependencies: ['vitepress'],
    configFiles: ['.vitepress/']
  },
  server: {
    command: 'npx vitepress dev',
    port: 5173,
  },
  routing: {
    contentPaths: ['.', 'docs'],
    extensions: ['.md']
  },
  content: {
    fileTypes: ['.md', '.json'],
  }
};
