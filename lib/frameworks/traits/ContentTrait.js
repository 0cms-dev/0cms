/**
 * ContentTrait.js
 * Handles content editing (Markdown, JSON, YAML) and the deterministic traceability
 * (Source Tagger) to map DOM elements to their file source.
 */
export class ContentTrait {
  constructor(config = {}) {
    this.extensions = config.extensions || ['.md', '.mdx', '.html', '.json', '.yaml', '.yml'];
    this.taggerScript = config.taggerScript || null;
  }

  static from(config) {
    if (config instanceof ContentTrait) return config;
    return new ContentTrait(config || {});
  }

  /**
   * Generates the script to be run inside the WebContainer to "tag" the source files.
   * Frameworks can provide their own (Hexo filter, Astro integration, etc.).
   */
  getTaggerScript(frameworkId) {
    if (this.taggerScript) return this.taggerScript;

    // Fallback: A generic non-intrusive tagger if the framework doesn't provide one
    return `
      console.log("[ContentTrait] No framework-specific tagger provided for ${frameworkId}. Using generic mapping.");
    `;
  }

  /**
   * Defines standard searchable file extensions for this framework's content.
   */
  getContentExtensions() {
    return this.extensions;
  }
}
