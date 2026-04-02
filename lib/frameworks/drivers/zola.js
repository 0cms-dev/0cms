/**
 * zola.js
 * Zola (Rust-based) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'zola',
  name: 'Zola',
  fingerprint: {
    files: ['config.toml', 'content', 'templates', 'static'],
  },
  server: {
    command: 'npx --yes zola-bin serve --interface 0.0.0.0 --port 1111',
    port: 1111,
  },
  routing: {
    contentPaths: ['content', 'templates'],
  },
  content: {
    fileTypes: ['.md', '.html', '.tera'],
  }
};
