/**
 * generic-vite.js
 * Fallback driver for any Vite-based project.
 */
export default {
  id: 'vite',
  name: 'Vite (Generic)',
  fingerprint: {
    dependencies: ['vite'],
    configFiles: ['vite.config.']
  },
  
  server: {
    command: 'npx --yes vite',
    port: 5173
  },
  
  routing: {
    contentPaths: ['/src', '/pages', '/content', '/app'],
    extensions: ['.js', '.jsx', '.tsx', '.vue', '.svelte', '.html', '.md', '.mdx', '.json']
  },
  
  content: {
    taggerScript: null
  },
  
  templating: {
    componentPath: '/src/components',
    templateType: 'html'
  }
};
