/**
 * hugo.js
 * Hugo (Go-based) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'hugo',
  name: 'Hugo',
  fingerprint: {
    configFiles: ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml'],
    files: ['archetypes', 'content', 'layouts'],
  },
  server: {
    command: 'hugo server', // Required WASM binary or remote preview
    port: 1313,
  },
  routing: {
    contentPaths: ['content'],
  },
  content: {
    fileTypes: ['.md', '.html'],
  }
};
