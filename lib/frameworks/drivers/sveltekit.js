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
    command: 'vite dev',
    port: 5173,
  },
  routing: {
    contentPaths: ['src/routes', 'src/lib'],
  },
  content: {
    fileTypes: ['.svelte', '.md', '.ts'],
  }
};
