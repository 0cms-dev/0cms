/**
 * TemplatingTrait.js
 * Handles component structures, partials, and the "Premium" component extraction logic.
 */
export class TemplatingTrait {
  constructor(config = {}) {
    this.componentPath = config.componentPath || '/src/components';
    this.templateType = config.templateType || 'html'; // html, jsx, astro, etc.
  }

  static from(config) {
    if (config instanceof TemplatingTrait) return config;
    return new TemplatingTrait(config || {});
  }

  /**
   * Prepares the file structure for a newly extracted component.
   * Returns a list of files to be written.
   */
  prepareComponentFiles(name, html, css) {
    const files = {};
    const baseName = name.replace(/\s+/g, '-').toLowerCase();
    
    if (this.templateType === 'astro') {
      files[`${this.componentPath}/${name}.astro`] = `---
// Extracted Component: ${name}
---
<div class="${baseName}-root">
  ${html}
</div>

<style>
  .${baseName}-root {
    ${css}
  }
</style>
`;
    } else if (this.templateType === 'jsx' || this.templateType === 'tsx') {
      files[`${this.componentPath}/${name}.${this.templateType}`] = `
import './${name}.css';

export const ${name} = () => (
  <div className="${baseName}-root">
    ${html.replace(/class=/g, 'className=')}
  </div>
);
`;
      files[`${this.componentPath}/${name}.css`] = `.${baseName}-root {\n${css}\n}`;
    } else {
      // Default HTML/Vanilla
      files[`${this.componentPath}/${name}.html`] = `<!-- Component: ${name} -->\n${html}`;
      if (css) {
        files[`${this.componentPath}/${name}.css`] = css;
      }
    }
    
    return files;
  }
}
