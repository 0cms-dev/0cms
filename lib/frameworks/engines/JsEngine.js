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
    } else if (['.html', '.njk', '.liquid', '.ejs'].includes(extension)) {
      return this.instrumentHtmlTemplate(content, fileId);
    }
    return content;
  }

  instrumentMarkdown(content, fileId) {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '---' || trimmed.startsWith('---')) return line;
      return MarkerService.wrap(line, fileId, index + 1);
    }).join('\n');
  }

  instrumentJson(content, fileId) {
    try {
      const obj = JSON.parse(content);
      this.tagJsonObject(obj, fileId);
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return content;
    }
  }

  tagJsonObject(obj, fileId) {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].trim()) {
         obj[key] = MarkerService.wrap(obj[key], fileId, 0);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
         this.tagJsonObject(obj[key], fileId);
      }
    }
  }

  /**
   * Universal HTML/Template Tagging.
   * Uses a smart regex to find text nodes and variable blocks.
   */
  instrumentHtmlTemplate(content, fileId) {
    // 1. Tag Text between tags: >Text< -> >MARKERText<
    let instrumented = content.replace(/>([^<>{%]+)</g, (match, text) => {
        if (!text.trim() || text.trim().length < 2) return match;
        return `>${MarkerService.wrap(text, fileId, 0)}<`;
    });

    // 2. Tag Variable blocks: {{ var }} -> {{ MARKERvar }}
    instrumented = instrumented.replace(/({{\s*)([^}]+)(\s*}})/g, (match, start, varBody, end) => {
        return `${start}${MarkerService.wrap(varBody, fileId, 0)}${end}`;
    });

    return instrumented;
  }

  strip(content) {
    return MarkerService.strip(content);
  }
}
