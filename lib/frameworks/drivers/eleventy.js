/**
 * eleventy.js
 * Eleventy (11ty) Declarative Driver for ZeroCMS.
 * Supports Liquid, Nunjucks, and Markdown.
 */
export default {
  name: 'Eleventy',
  fingerprint: {
    dependencies: ['@11ty/eleventy'],
  },
  server: {
    command: 'npx --yes @11ty/eleventy --serve --port 8080',
    port: 8080,
  },
  routing: {
    contentPaths: ['src', '_data', '_includes', '_layouts', 'content'],
    extensions: ['.md', '.html', '.liquid', '.njk', '.hbs', '.ejs', '.json', '.yml']
  },
  content: {
    fileTypes: ['.md', '.html', '.liquid', '.njk', '.hbs', '.ejs'],
  }
};
