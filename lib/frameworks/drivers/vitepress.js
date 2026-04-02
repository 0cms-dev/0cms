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
    command: 'npx --yes vitepress dev docs --host 0.0.0.0 --port 5173',
    port: 5173,
  },
  routing: {
    contentPaths: ['docs', 'src', '.vitepress/theme/components', '.vitepress/config'],
    extensions: ['.md', '.js', '.ts', '.vue', '.json']
  },
  content: {
    fileTypes: ['.md', '.vue'],
  }
};
