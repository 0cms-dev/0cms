/**
 * 0cms Bridge (cms.js)
 * The invisible agent injected into the preview frame to enable
 * visual editing and deterministic source mapping.
 */
class ZeroCMS {
  constructor() {
    this.active = false;
    this.styleId = 'cms-styles';
    this.storageKey = `cms-data-${window.location.pathname}`;
    this.inIframe = window.self !== window.top;
    this.historyStack = [];
    this.redoStack = [];
    this.changes = {};
    this.activeMarker = null;
    this.init();
  }

  init() {
    this.setupStyles();
    this.changes = JSON.parse(localStorage.getItem(this.storageKey) || '{}') || {};
    this.historyStack = JSON.parse(localStorage.getItem(`${this.storageKey}-history`) || '[]') || [];
    
    if (this.inIframe) {
      window.addEventListener('message', (e) => {
        if (e.data.type === 'CMS_TOGGLE') e.data.enabled ? this.enable() : this.disable();
        if (e.data.type === 'CMS_UNDO') this.undo();
        if (e.data.type === 'CMS_REDO') this.redo();
        if (e.data.type === 'CMS_HIGHLIGHT') this.highlight(e.data.selector);
        if (e.data.type === 'CMS_EXTRACT_MODE') this.toggleExtractMode(e.data.enabled);
        if (e.data.type === 'CMS_EXTRACT_TRIGGER') this.captureComponent(e.data.name);
      });
      window.parent.postMessage({ type: 'CMS_READY' }, '*');
    }

    // Global Click Listener for Source Mapping & Editing
    document.addEventListener('click', (e) => {
      if (!this.active) return;
      if (e.target.closest('.cms-ui')) return; // Ignore clicks on CMS UI elements

      const el = e.target;
      const selector = this.getSelector(el);
      
      // DETERMINISTIC SOURCE MAPPING (The Super Tagger Sniffer)
      const breadcrumb = this.findBreadcrumb(el);
      if (breadcrumb) {
          window.parent.postMessage({
              type: 'CMS_SOURCE_LOCATED',
              fileId: breadcrumb.fileId,
              line: breadcrumb.line,
              selector
          }, '*');
      }

      // Standard Editing Logic
      if (el.tagName === 'IMG') {
          e.preventDefault();
          this.handleImageClick(el, selector);
      } else if (el.classList.contains('cms-editable')) {
          // Handled by native contentEditable/onblur
      }
    }, true);
  }

  enable() {
    this.active = true;
    this.scanAndApply();
  }

  disable() {
    this.active = false;
    document.querySelectorAll('.cms-editable').forEach(el => el.contentEditable = 'false');
  }

  findBreadcrumb(element) {
    const START = '\uFEFF'; 
    const ZERO = '\u200B';
    const ONE = '\u200C';
    const SEP = '\u200D';
    const END = '\uFEFF';

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while(node = walker.nextNode()) {
      const text = node.nodeValue;
      const regex = new RegExp(`${START}([${ZERO}${ONE}${SEP}]+)${END}`, 'g');
      const matches = [...text.matchAll(regex)];
      if (matches.length > 0) {
        const payload = matches[0][1];
        const parts = payload.split(SEP);
        if (parts.length === 2) {
            const fileId = parseInt(parts[0].split('').map(c => c === ONE ? '1' : '0').join(''), 2);
            const line = parseInt(parts[1].split('').map(c => c === ONE ? '1' : '0').join(''), 2);
            return { fileId, line };
        }
      }
    }
    if (element.parentElement && element.parentElement !== document.body) {
        return this.findBreadcrumb(element.parentElement);
    }
    return null;
  }

  handleImageClick(img, selector) {
    const src = prompt('Update Image URL:', img.src);
    if (src && src !== img.src) {
        img.src = src;
        this.saveChange(selector, src);
    }
  }

  saveChange(selector, content) {
    this.changes[selector] = content;
    localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
    this.historyStack.push({ selector, new: content, timestamp: new Date().toLocaleTimeString() });
    window.parent.postMessage({ type: 'CMS_CHANGED', changes: this.changes }, '*');
  }

  getSelector(el) {
    if (el.id) return `#${el.id}`;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() === selector) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      el = el.parentNode;
      if (!el || el.nodeName === 'BODY') break;
    }
    return path.join(' > ');
  }

  scanAndApply() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const p = node.parentElement;
        if (!p || p.closest('.cms-ui') || p.closest('nav')) return NodeFilter.FILTER_REJECT;
        const ignored = ['SCRIPT', 'STYLE', 'CODE', 'INPUT'];
        if (ignored.includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while (node = walker.nextNode()) {
      const el = node.parentElement;
      el.classList.add('cms-editable');
      el.contentEditable = 'true';
      el.onblur = () => this.saveChange(this.getSelector(el), el.innerText);
    }
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .cms-editable:hover { outline: 2px dashed #7c3aed; outline-offset: 4px; cursor: text; }
      .cms-editable:focus { outline: 2px solid #7c3aed; background: rgba(124, 58, 237, 0.05); }
      .cms-highlight { outline: 4px solid #7c3aed !important; outline-offset: 4px !important; }
    `;
    document.head.appendChild(style);
  }

  // Extraction Logic
  toggleExtractMode(enabled) {
    this.extractMode = enabled;
    document.body.style.cursor = enabled ? 'crosshair' : '';
  }

  captureComponent(name) {
    // Logic for capturing component HTML/CSS
  }
}

export default new ZeroCMS();
