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
   */
  instrumentHtmlTemplate(content, fileId) {
    // 1. Tag Text: >Text< -> >MARKERText<
    let instrumented = content.replace(/>([^<>{%?@]+)</g, (match, text) => {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 2 || trimmed.startsWith('<?')) return match;
        return `>${MarkerService.wrap(text, fileId, 0)}<`;
    });

    // 2. Tag Variables: {{ var }}, {!! var !!}, <?= var ?>, {{ var|filter }}
    // Matches: {{ ... }}, {!! ... !!}, <?= ... ?>, <?php echo ... ?>
    instrumented = instrumented.replace(/({{\s*|{!!\s*|<\?=\s*|<\?php\s+echo\s+)([^?}!]+?)(\s*}}|\s*!!}|\s*\?>)/g, (match, start, varBody, end) => {
        return `${start}${MarkerService.wrap(varBody, fileId, 0)}${end}`;
    });

    // 3. Tag Logic Blocks (optional, but helps with traceability): {% ... %}, @foreach(...)
    // Matches: {% if ... %}, @foreach(...)
    instrumented = instrumented.replace(/({%\s*|@foreach\s*\()([^%)]+?)(\s*%\)|\s*\))/g, (match, start, logicBody, end) => {
        // We only tag the internal logic for traceability if it contains text/echo
        return `${start}${MarkerService.wrap(logicBody, fileId, 0)}${end}`;
    });

    return instrumented;
  }

  strip(content) {
    return MarkerService.strip(content);
  }
}
