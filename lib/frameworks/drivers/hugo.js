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
    command: 'npx --yes hugo-bin server -D --bind 0.0.0.0 --port 1313 --appendPort=false',
    port: 1313,
  },
  routing: {
    contentPaths: ['content', 'layouts', 'archetypes', 'assets'],
    extensions: ['.md', '.html', '.xml', '.toml']
  },
  content: {
    fileTypes: ['.md', '.html'],
  }
};
