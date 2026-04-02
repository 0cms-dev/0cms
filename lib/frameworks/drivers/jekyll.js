/**
 * jekyll.js
 * Jekyll (Ruby-based) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'jekyll',
  name: 'Jekyll',
  fingerprint: {
    files: ['_config.yml', 'Gemfile'],
  },
  server: {
    command: 'npx --yes jekyll-bin serve --host 0.0.0.0 --port 4000',
    port: 4000,
  },
  routing: {
    contentPaths: ['_posts', '_pages', '.'],
  },
  content: {
    fileTypes: ['.md', '.html', '.markdown'],
  }
};
