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
    this.seoBaseline = { title: '', description: '', image: '' };
    this.init();
  }

  init() {
    this.setupStyles();
    this.changes = JSON.parse(localStorage.getItem(this.storageKey) || '{}') || {};
    this.historyStack = JSON.parse(localStorage.getItem(`${this.storageKey}-history`) || '[]') || [];
    
    // Baseline capture + Reconciliation (CLEANUP GHOSTS)
    setTimeout(() => {
        this.captureBaseline();
        this.reconcile();
    }, 200);

    if (this.inIframe) {
      window.addEventListener('message', (e) => {
        if (e.data.type === 'CMS_TOGGLE') e.data.enabled ? this.enable() : this.disable();
        if (e.data.type === 'CMS_UNDO') this.undo();
        if (e.data.type === 'CMS_REDO') this.redo();
        if (e.data.type === 'CMS_HIGHLIGHT') this.highlight(e.data.selector);
        if (e.data.type === 'CMS_REVERT') this.revert(e.data.selector);
        if (e.data.type === 'CMS_SET_SEO') this.setSEO(e.data);
        if (e.data.type === 'CMS_GET_SEO') this.sendSEO();
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
        const original = img.dataset.cmsOriginal || img.src;
        img.src = src;
        this.saveChange(selector, src, original);
    }
  }

  saveChange(selector, content, original = null) {
    if (this.changes[selector] === content) return;
    
    // If we've returned to the baseline/original state, remove the change record
    const normContent = (content || '').trim();
    const normOriginal = (original || '').trim();

    if (normContent === normOriginal) {
        delete this.changes[selector];
        this.historyStack = this.historyStack.filter(e => e.selector !== selector);
        
        const el = document.querySelector(selector);
        if (el) el.classList.remove('cms-modified');

        this.broadcast();
        return;
    }

    const entry = { 
      selector, 
      original: original || this.changes[selector] || '', 
      updated: content, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    };
    
    this.changes[selector] = content;
    this.historyStack.push(entry);
    
    // Visual indicator for modified state
    const el = document.querySelector(selector);
    if (el) el.classList.add('cms-modified');

    this.broadcast();
  }

  captureBaseline() {
    this.seoBaseline = {
      title: (document.title || '').trim(),
      description: (document.querySelector('meta[name="description"]')?.content || '').trim(),
      image: (document.querySelector('meta[property="og:image"]')?.content || '').trim()
    };
  }

  reconcile() {
    let changed = false;
    const seoKeys = ['seo:title', 'seo:description', 'seo:image'];
    
    seoKeys.forEach(key => {
        const baselineVal = this.seoBaseline[key.split(':')[1]];
        if (this.changes[key] === baselineVal) {
            delete this.changes[key];
            this.historyStack = this.historyStack.filter(e => e.selector !== key);
            changed = true;
        }
    });
    
    if (changed) {
        this.broadcast();
    }
  }

  broadcast() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
    localStorage.setItem(`${this.storageKey}-history`, JSON.stringify(this.historyStack));

    window.parent.postMessage({ 
      type: 'CMS_CHANGED', 
      changes: this.changes,
      entries: this.historyStack,
      canUndo: this.historyStack.length > 0,
      canRedo: this.redoStack.length > 0
    }, '*');
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
        if (!p || p.closest('.cms-ui')) return NodeFilter.FILTER_REJECT;
        const ignored = ['SCRIPT', 'STYLE', 'CODE', 'INPUT', 'NOSCRIPT'];
        if (ignored.includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node, count = 0;
    while (node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el.dataset.cmsOriginal) {
          el.dataset.cmsOriginal = el.innerText;
      }
      
      const selector = this.getSelector(el);
      if (this.changes[selector] && this.changes[selector] !== el.dataset.cmsOriginal) {
          el.classList.add('cms-modified');
      }

      el.classList.add('cms-editable');
      el.contentEditable = 'true';
      el.onblur = () => this.saveChange(selector, el.innerText, el.dataset.cmsOriginal);
      count++;
    }
    console.log(`%c[0cms] %cEditor Active. Found ${count} editable elements.`, 'color:#7c3aed; font-weight:bold;', 'color:inherit;');
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .cms-editable { transition: all 0.2s ease !important; }
      .cms-editable:hover { outline: 2px dashed #3b82f6 !important; outline-offset: 4px !important; cursor: text !important; box-shadow: 0 0 15px rgba(59, 130, 246, 0.3) !important; }
      .cms-editable:focus { outline: 2px solid #10b981 !important; background: rgba(16, 185, 129, 0.05) !important; z-index: 100001 !important; position: relative !important; box-shadow: 0 0 20px rgba(16, 185, 129, 0.4) !important; outline-offset: 6px !important; }
      .cms-modified:not(:focus) { outline: 2px dashed #a855f7 !important; outline-offset: 4px !important; box-shadow: 0 0 10px rgba(168, 85, 247, 0.2) !important; }
      .cms-highlight { outline: 4px solid #3b82f6 !important; outline-offset: 4px !important; z-index: 110000 !important; box-shadow: 0 0 50px rgba(59, 130, 246, 0.4) !important; animation: cms-pulse 2s infinite !important; }
      @keyframes cms-pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
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

  highlight(selector) {
    document.querySelectorAll('.cms-highlight').forEach(el => el.classList.remove('cms-highlight'));
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.classList.add('cms-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('cms-highlight'), 3000);
      }
    } catch (e) {}
  }

  revert(selector) {
    const el = document.querySelector(selector);
    const original = el ? el.dataset.cmsOriginal : null;
    
    // Also check history for original if not on element
    const lastEntry = [...this.historyStack].reverse().find(e => e.selector === selector);
    const val = original || (lastEntry ? lastEntry.original : null);

    if (val !== null) {
      if (el) {
        if (el.tagName === 'IMG') el.src = val;
        else el.innerText = val;
        el.classList.remove('cms-modified');
      }
      delete this.changes[selector];
      this.historyStack = this.historyStack.filter(e => e.selector !== selector);
      
      localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
      localStorage.setItem(`${this.storageKey}-history`, JSON.stringify(this.historyStack));
      
      window.parent.postMessage({ 
        type: 'CMS_CHANGED', 
        changes: this.changes,
        entries: this.historyStack,
        canUndo: this.historyStack.length > 0,
        canRedo: this.redoStack.length > 0
      }, '*');
    }
  }

  undo() {
    if (this.historyStack.length === 0) return;
    const entry = this.historyStack.pop();
    this.redoStack.push(entry);
    
    const el = document.querySelector(entry.selector);
    if (el) {
      if (el.tagName === 'IMG') el.src = entry.original;
      else el.innerText = entry.original;
      el.classList.remove('cms-modified');
    }
    
    delete this.changes[entry.selector];
    this.broadcast();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const entry = this.redoStack.pop();
    this.historyStack.push(entry);
    
    const el = document.querySelector(entry.selector);
    if (el) {
      if (el.tagName === 'IMG') el.src = entry.updated;
      else el.innerText = entry.updated;
      el.classList.add('cms-modified');
    }
    
    this.changes[entry.selector] = entry.updated;
    this.broadcast();
  }

  setSEO(data) {
    // Record in history if changed and different from baseline
    if (data.hasOwnProperty('title')) {
        if (data.title !== this.seoBaseline.title) {
            this.saveChange('seo:title', data.title, this.seoBaseline.title);
            document.title = data.title;
        } else {
            this.removeChange('seo:title');
            document.title = this.seoBaseline.title;
        }
    }
    if (data.hasOwnProperty('description')) {
        if (data.description !== this.seoBaseline.description) {
            this.saveChange('seo:description', data.description, this.seoBaseline.description);
            let meta = document.querySelector('meta[name="description"]');
            if (meta) meta.setAttribute('content', data.description);
        } else {
            this.removeChange('seo:description');
            let meta = document.querySelector('meta[name="description"]');
            if (meta) meta.setAttribute('content', this.seoBaseline.description);
        }
    }
    if (data.hasOwnProperty('image')) {
        if (data.image !== this.seoBaseline.image) {
            this.saveChange('seo:image', data.image, this.seoBaseline.image);
            let meta = document.querySelector('meta[property="og:image"]');
            if (meta) meta.setAttribute('content', data.image);
        } else {
            this.removeChange('seo:image');
            let meta = document.querySelector('meta[property="og:image"]');
            if (meta) meta.setAttribute('content', this.seoBaseline.image);
        }
    }
  }

  removeChange(selector) {
    if (this.changes[selector]) {
        delete this.changes[selector];
        this.historyStack = this.historyStack.filter(e => e.selector !== selector);
        
        const el = document.querySelector(selector);
        if (el) el.classList.remove('cms-modified');

        this.broadcast();
    }
  }

  sendSEO() {
    const title = document.title;
    const descEl = document.querySelector('meta[name="description"]');
    const ogImgEl = document.querySelector('meta[property="og:image"]');
    
    window.parent.postMessage({
      type: 'CMS_SEO_DATA',
      title: title || this.changes['seo:title'] || '',
      description: (descEl ? descEl.getAttribute('content') : '') || this.changes['seo:description'] || '',
      image: (ogImgEl ? ogImgEl.getAttribute('content') : '') || this.changes['seo:image'] || ''
    }, '*');
  }

  broadcast() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
    localStorage.setItem(`${this.storageKey}-history`, JSON.stringify(this.historyStack));
    window.parent.postMessage({ 
      type: 'CMS_CHANGED', 
      changes: this.changes,
      entries: this.historyStack,
      canUndo: this.historyStack.length > 0,
      canRedo: this.redoStack.length > 0
    }, '*');
  }
}

export default new ZeroCMS();
