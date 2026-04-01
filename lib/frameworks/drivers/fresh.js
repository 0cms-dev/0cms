/**
 * fresh.js
 * Fresh (Deno) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'fresh',
  name: 'Fresh',
  fingerprint: {
    files: ['deno.json', 'fresh.gen.ts'],
  },
  server: {
    command: 'deno task start',
    port: 8000,
  },
  routing: {
    contentPaths: ['routes', 'islands', 'static'],
  },
  content: {
    fileTypes: ['.tsx', '.jsx'],
  }
};
