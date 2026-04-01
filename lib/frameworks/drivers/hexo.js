/**
 * hexo.js
 * Declarative framework driver for Hexo.
 */
export default {
  id: 'hexo',
  name: 'Hexo',
  fingerprint: {
    dependencies: ['hexo'],
    files: ['_config.yml']
  },
  
  server: {
    command: 'npx hexo server',
    port: 4000
  },
  
  routing: {
    contentPaths: ['/source/_posts', '/source'],
    extensions: ['.md', '.html']
  },
  
  content: {
    taggerScript: `
      // Hexo Source Tagger Filter
      hexo.extend.filter.register('after_render:html', function(html, data) {
        if (data.source) {
          const sourcePath = 'source/' + data.source;
          return html.replace('<body', '<body data-zcms-source="' + sourcePath + '"');
        }
        return html;
      });
    `
  },
  
  templating: {
    componentPath: '/source/_partials',
    templateType: 'ejs'
  }
};
