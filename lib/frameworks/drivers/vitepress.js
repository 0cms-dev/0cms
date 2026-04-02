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
    command: 'npx --yes vitepress dev --host 0.0.0.0 --port 5173',
    port: 5173,
  },
  routing: {
    contentPaths: ['.', 'docs', 'i18n', 'src', '.vitepress/theme/components'],
    extensions: ['.md', '.mdx', '.js', '.ts', '.vue']
  },
  content: {
    fileTypes: ['.md', '.mdx', '.json', '.vue'],
  }
};
