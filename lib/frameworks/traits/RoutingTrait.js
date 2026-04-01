/**
 * RoutingTrait.js
 * Handles mapping URLs (from the browser) to original source files (in the WebContainer).
 * This allows the CMS to know WHICH file to edit when you're at a specific URL.
 */
export class RoutingTrait {
  constructor(config = {}) {
    this.contentPaths = config.contentPaths || ['/content', '/src/pages'];
    this.extensions = config.extensions || ['.md', '.mdx', '.html', '.astro', '.vue', '.tsx'];
  }

  static from(config) {
    if (config instanceof RoutingTrait) return config;
    return new RoutingTrait(config || {});
  }

  /**
   * Translates a URL path into a potential list of file paths.
   * Example: /posts/hello -> ['/src/pages/posts/hello.md', '/src/pages/posts/hello.astro']
   */
  async resolveUrlToFiles(urlPath) {
    const cleanPath = urlPath === '/' ? '/index' : urlPath.replace(/\/$/, '');
    const results = [];
    
    for (const dir of this.contentPaths) {
      for (const ext of this.extensions) {
        results.push(path.join(dir, cleanPath + ext));
      }
    }
    return results;
  }

  getContentPaths() {
    return this.contentPaths;
  }
}
