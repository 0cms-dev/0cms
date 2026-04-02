/**
 * sveltekit.js
 * SvelteKit Declarative Driver for ZeroCMS.
 */
export default {
  name: 'SvelteKit',
  fingerprint: {
    dependencies: ['@sveltejs/kit'],
  },
  server: {
    command: 'npx --yes vite dev --host 0.0.0.0 --port 5173',
    port: 5173,
  },
  routing: {
    contentPaths: ['src/routes', 'src/lib/components', 'src/lib/layouts', 'src/content', 'content'],
    extensions: ['.svelte', '.js', '.ts', '.md', '.mdx']
  },
  content: {
    fileTypes: ['.svelte', '.md', '.mdx'],
  }
};
