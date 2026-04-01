/**
 * astro.js
 * Declarative framework driver for Astro.
 */
export const astro = {
  id: 'astro',
  name: 'Astro',
  
  // Semantic Traits Configuration
  server: {
    command: 'npx astro dev',
    port: 4321
  },
  
  routing: {
    contentPaths: ['/src/content', '/src/pages'],
    extensions: ['.md', '.mdx', '.astro']
  },
  
  content: {
    taggerScript: `
      // Astro integration-based tagging logic would go here
    `
  },
  
  templating: {
    componentPath: '/src/components',
    templateType: 'astro'
  }
};
