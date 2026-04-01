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
    command: 'npx @11ty/eleventy --serve',
    port: 8080,
  },
  routing: {
    contentPaths: ['.'], // Root-based
  },
  content: {
    fileTypes: ['.md', '.njk', '.liquid', '.html'],
  }
};
