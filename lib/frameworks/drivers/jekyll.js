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
    command: 'bundle exec jekyll serve',
    port: 4000,
  },
  routing: {
    contentPaths: ['_posts', '_pages', '.'],
  },
  content: {
    fileTypes: ['.md', '.html', '.markdown'],
  }
};
