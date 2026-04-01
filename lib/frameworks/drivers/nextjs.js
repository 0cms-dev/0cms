/**
 * nextjs.js
 * Declarative framework driver for Next.js.
 */
export const nextjs = {
  id: 'nextjs',
  name: 'Next.js',
  
  server: {
    command: 'npx next dev',
    port: 3000
  },
  
  routing: {
    contentPaths: ['/pages', '/app', '/src/pages', '/src/app', '/content'],
    extensions: ['.js', '.jsx', '.tsx', '.md', '.mdx', '.json']
  },
  
  content: {
    taggerScript: null
  },
  
  templating: {
    componentPath: '/components',
    templateType: 'jsx'
  }
};
