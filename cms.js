class ZeroConfigCMS {
  constructor() {
    this.active = false;
    this.styleId = 'cms-styles';
    this.storageKey = `cms-data-${window.location.pathname}`;
    this.changes = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    this.init();
  }

  init() {
    this.setupStyles();
    // Auto-load changes if any
    if (Object.keys(this.changes).length > 0) {
      this.applySavedChanges();
    }
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .cms-editable:hover {
        outline: 2px dashed #3498db !important;
        outline-offset: 2px;
        cursor: pointer;
      }
      .cms-editable:focus {
        outline: 2px solid #2ecc71 !important;
        background: rgba(46, 204, 113, 0.05);
      }
      .cms-img-container {
        position: relative;
        display: inline-block;
        width: 100%;
      }
      .cms-img-overlay {
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 100;
      }
      .cms-img-container:hover .cms-img-overlay {
        opacity: 1;
      }
      .cms-img-btn {
        background: #2d3436;
        color: white;
        border: none;
        padding: 5px 12px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        font-family: sans-serif;
      }
      .cms-img-btn:hover { background: #000; }
      .cms-img-editable:hover { filter: brightness(0.9); }
    `;
    document.head.appendChild(style);
  }

  enable() {
    if (this.active) return;
    if (window.location.protocol === 'file:') {
      alert('Zero-Config CMS: ES Modules are blocked on file:// protocol. Please use a local server (start_dev.sh).');
    }
    this.active = true;
    this.scanAndApply();
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    document.querySelectorAll('.cms-editable').forEach(el => {
      el.contentEditable = 'false';
      el.classList.remove('cms-editable');
      delete el.dataset.cmsReady;
    });
    document.querySelectorAll('.cms-img-container').forEach(container => {
      const img = container.querySelector('img');
      img.classList.remove('cms-img-editable');
      delete img.dataset.cmsReady;
      container.parentNode.insertBefore(img, container);
      container.remove();
    });
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
      if (el.nodeName === 'BODY') break;
    }
    return path.join(' > ');
  }

  saveChange(selector, content) {
    this.changes[selector] = content;
    localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('cms-changed', { detail: this.changes }));
  }

  applySavedChanges() {
    for (const [selector, content] of Object.entries(this.changes)) {
      const el = document.querySelector(selector);
      if (el) {
        if (el.tagName === 'IMG') el.src = content;
        else el.innerText = content;
      }
    }
  }

  scanAndApply() {
    this.setupStyles();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest('.cms-ui') || parent.closest('nav') || parent.closest('button')) return NodeFilter.FILTER_REJECT;
        const ignored = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'INPUT', 'TEXTAREA', 'SELECT'];
        if (ignored.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim() || node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while (node = walker.nextNode()) this.makeEditable(node.parentElement);

    document.querySelectorAll('img').forEach(img => {
      if (img.closest('.cms-ui') || img.closest('nav') || img.closest('button')) return;
      this.makeImageEditable(img);
    });
  }

  makeEditable(el) {
    if (el.dataset.cmsReady) return;
    el.dataset.cmsReady = 'true';
    el.classList.add('cms-editable');
    try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }

    el.onblur = () => {
      const selector = this.getSelector(el);
      this.saveChange(selector, el.innerText);
    };

    el.onkeydown = (e) => { 
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); } 
    };

    el.onpaste = (e) => {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(text));
      sel.collapseToEnd();
    };
  }

  makeImageEditable(img) {
    if (img.dataset.cmsReady) return;
    img.dataset.cmsReady = 'true';
    img.classList.add('cms-img-editable');

    const container = document.createElement('div');
    container.className = 'cms-img-container';
    img.parentNode.insertBefore(container, img);
    container.appendChild(img);

    const overlay = document.createElement('div');
    overlay.className = 'cms-img-overlay cms-ui';

    const btnUrl = document.createElement('button');
    btnUrl.className = 'cms-img-btn';
    btnUrl.textContent = 'URL';
    btnUrl.onclick = () => {
      const src = prompt('Image URL:', img.src);
      if (src && src !== img.src) {
        img.src = src;
        this.saveChange(this.getSelector(img), src);
      }
    };

    const btnUpload = document.createElement('button');
    btnUpload.className = 'cms-img-btn';
    btnUpload.textContent = 'Upload';
    btnUpload.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = e => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = rs => {
            img.src = rs.target.result;
            this.saveChange(this.getSelector(img), img.src);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    };

    overlay.append(btnUrl, btnUpload);
    container.appendChild(overlay);
  }
}

export default new ZeroConfigCMS();
