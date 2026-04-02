import { MarkerService } from '../../services/MarkerService.js';

/**
 * JsEngine.js
 * The standard, pure-JavaScript implementation of the Zero-Width 
 * instrumentation logic.
 * 
 * - [x] Refactor `TaggerTrait.js` to be engine-agnostic
 * - [x] Create `JsEngine.js` (Logic for standard Unicode breadcrumbs)
 * - [x] Create `WasmEngine.js` (The high-performance WASM Bridge)
 * - [x] Update `WebContainerGitService.js` for **Batch Instrumentation**
 * - [x] Implement Universal Template Tagging (HTML/Liquid/Nunjucks)
 * - [ ] Verification with 10k file benchmark (Mock WASM)
 */
export class JsEngine {
  constructor() {}

  /**
   * Instruments a single file's content based on its type.
   */
  instrument(content, fileId, extension) {
    if (extension === '.md') {
      return this.instrumentMarkdown(content, fileId);
    } else if (extension === '.json') {
      return this.instrumentJson(content, fileId);
    } else if (['.html', '.njk', '.liquid', '.ejs', '.php', '.blade.php', '.twig', '.tera', '.vue', '.svelte'].includes(extension)) {
      return this.instrumentHtmlTemplate(content, fileId);
    }
    return content;
  }

  // ... (markdown/json methods remain the same) ...

  /**
   * Universal HTML/Template Tagging.
   * Handles HTML, Liquid, PHP, Blade, Django, etc.
   * Tracks line numbers to match the Rust-WASM engine's precision.
   */
  instrumentHtmlTemplate(content, fileId) {
    let lineNum = 1;
    let lastIndex = 0;
    let output = '';

    // Universal Regex for Tags (HTML, Blade, Liquid, PHP)
    const reTag = /(<([a-zA-Z0-9-]+)[^>]*>)|(\{\{[^}]*\}\})|(\{%.*?%\})|(<\?php.*?\?>)|(@(?:if|foreach|for|while|extends|section|yield|include|component).*?$)/gm;

    let match;
    while ((match = reTag.exec(content)) !== null) {
        // 1. Add skipped content
        const skipped = content.substring(lastIndex, match.index);
        output += skipped;
        lineNum += (skipped.match(/\n/g) || []).length;

        // 2. Add marker + tag
        output += MarkerService.encode(fileId, lineNum);
        output += match[0];

        // 3. Update line count based on tag content
        lineNum += (match[0].match(/\n/g) || []).length;
        lastIndex = reTag.lastIndex;
    }

    output += content.substring(lastIndex);
    return output;
  }

  strip(content) {
    return MarkerService.strip(content);
  }
}
