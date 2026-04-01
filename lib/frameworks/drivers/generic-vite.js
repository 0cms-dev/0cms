/**
 * generic-vite.js
 * Fallback driver for any Vite-based project.
 * Demonstrates the power of 'Semantic Traits' with a catch-all configuration.
 */
export const genericVite = {
  id: 'vite',
  name: 'Vite (Generic)',
  
  server: {
    command: 'npx vite',
    port: 5173
  },
  
  routing: {
    contentPaths: ['/src'],
    extensions: ['.js', '.jsx', '.tsx', '.vue', '.svelte', '.html']
  },
  
  content: {
    taggerScript: null
  },
  
  templating: {
    componentPath: '/src/components',
    templateType: 'html'
  }
};
