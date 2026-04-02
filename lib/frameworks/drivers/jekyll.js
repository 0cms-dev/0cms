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
    command: 'npx --yes jekyll-bin server --host 0.0.0.0 --port 4000 --livereload',
    port: 4000,
  },
  routing: {
    contentPaths: ['_posts', '_pages', '_layouts', '_includes', '_data', 'assets', '_sass', '_site'],
    extensions: ['.md', '.html', '.markdown', '.yml', '.yaml', '.json']
  },
  content: {
    fileTypes: ['.md', '.html', '.markdown'],
  }
};
