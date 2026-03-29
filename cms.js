class ZeroConfigCMS {
  constructor() {
    this.active = false;
    this.styleId = 'cms-styles';
    this.storageKey = `cms-data-${window.location.pathname}`;
    this.changes = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
    this.inIframe = window.self !== window.top;
    this.init();
  }

  init() {
    this.setupStyles();
    if (Object.keys(this.changes).length > 0) this.applySavedChanges();
    this.fixExternalImages();
    
    // Listen for parent commands if in Iframe
    if (this.inIframe) {
      window.addEventListener('message', (e) => {
        if (e.data.type === 'CMS_CONFIG') {
          this.proxyUrl = e.data.proxyUrl;
          this.fixExternalImages();
        }
        if (e.data.type === 'CMS_TOGGLE') {
          e.data.enabled ? this.enable() : this.disable();
        }
        if (e.data.type === 'CMS_CLEAR') {
          this.changes = {};
          localStorage.removeItem(this.storageKey);
          location.reload();
        }
        if (e.data.type === 'CMS_PURGE') {
          this.changes = {};
          localStorage.removeItem(this.storageKey);
          // Silent - no reload, let SSG HMR handle it
        }
        if (e.data.type === 'CMS_REVERT' && e.data.selector) {
          delete this.changes[e.data.selector];
          localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
          // Re-apply all remaining saved changes from a clean state
          location.reload();
        }
        if (e.data.type === 'CMS_GET_SEO') {
            const titleEl = document.querySelector('title');
            const descEl = document.querySelector('meta[name="description"]');
            window.parent.postMessage({
                type: 'CMS_SEO_DATA',
                title: titleEl ? titleEl.innerText : '',
                description: descEl ? descEl.getAttribute('content') : ''
            }, '*');
        }
        if (e.data.type === 'CMS_SET_SEO') {
            const titleEl = document.querySelector('title');
            if (titleEl && e.data.title !== titleEl.innerText) {
                if (!titleEl.dataset.cmsOriginal) titleEl.dataset.cmsOriginal = titleEl.innerText;
                titleEl.innerText = e.data.title;
                this.saveChange(this.getSelector(titleEl), e.data.title);
            }
            
            const descEl = document.querySelector('meta[name="description"]');
            if (descEl && e.data.description !== descEl.getAttribute('content')) {
                if (!descEl.dataset.cmsOriginal) descEl.dataset.cmsOriginal = descEl.getAttribute('content');
                descEl.setAttribute('content', e.data.description);
                this.saveChange(this.getSelector(descEl), e.data.description);
            }
        }
      });
      // Initial notification of existing changes
      this.notifyParent();
      // Signal that the CMS is ready to be used
      window.parent.postMessage({ type: 'CMS_READY' }, '*');
    }
  }

  notifyParent() {
    if (this.notifyTimeout) clearTimeout(this.notifyTimeout);
    this.notifyTimeout = setTimeout(() => this._performNotify(), 300);
  }

  _performNotify() {
    if (!this.inIframe) return;
    try {
      const entries = Object.entries(this.changes).map(([sel, val]) => {
        try {
          const el = document.querySelector(sel);
          const sourceFile = el ? (el.dataset.cmsSource || el.getAttribute('data-astro-source-file') || document.body.dataset.cmsSource) : null;
          let type = 'unknown';
          let original = null;
          if (el) {
              if (el.tagName === 'IMG') type = 'image';
              else if (el.tagName === 'META') type = 'meta';
              else if (el.tagName === 'TITLE') type = 'title';
              else type = 'text';
              original = el.dataset.cmsOriginal;
          }
          return {
            selector: sel,
            updated: val,
            original: original,
            sourceFile: sourceFile,
            type: type
          };
        } catch (e) { return null; }
      }).filter(Boolean);

      window.parent.postMessage({ 
        type: 'CMS_CHANGED', 
        changes: this.changes,
        entries: entries
      }, '*');
    } catch (e) {
      console.warn('[CMS] Failed to notify parent:', e.message);
    }
  }

  fixExternalImages() {
    const fix = (img) => {
      if (!img.src || img.getAttribute('data-cms-fixed')) return;
      try {
        const url = new URL(img.src, window.location.href);
        if (url.origin !== window.location.origin) {
          if (this.proxyUrl) {
            console.log(`[CMS] Proxying external image: ${img.src}`);
            img.src = this.proxyUrl + encodeURIComponent(img.src);
            img.setAttribute('data-cms-fixed', 'true');
          } else if (!img.hasAttribute('crossorigin')) {
            img.setAttribute('crossorigin', 'anonymous');
            const originalSrc = img.src;
            img.src = '';
            img.src = originalSrc;
          }
        }
      } catch (e) {}
    };

    document.querySelectorAll('img').forEach(fix);
    this.fixDynamicImages(fix);
  }

  fixDynamicImages(fix) {
    if (this.imgObserver) return;
    this.imgObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'IMG') fix(node);
            else if (node.querySelectorAll) node.querySelectorAll('img').forEach(fix);
          });
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          fix(mutation.target);
        }
      });
    });
    this.imgObserver.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      @keyframes cmsGlowPulse {
        0% { outline-color: rgba(138, 43, 226, 0.4); box-shadow: 0 0 10px rgba(138, 43, 226, 0.2); }
        50% { outline-color: rgba(138, 43, 226, 0.9); box-shadow: 0 0 20px rgba(138, 43, 226, 0.4); }
        100% { outline-color: rgba(138, 43, 226, 0.4); box-shadow: 0 0 10px rgba(138, 43, 226, 0.2); }
      }

      .cms-editable { 
        transition: background-color 0.3s ease, border-radius 0.3s ease; 
        border-radius: 4px;
        outline: 2px solid transparent; 
        outline-offset: 2px;
      }
      
      .cms-editable:hover { 
        cursor: text; 
        border-radius: 6px !important; 
        outline: 2px solid rgba(138, 43, 226, 0.8) !important;
        outline-offset: 6px !important; /* Creates padding visually without shifting layout */
        background-color: rgba(138, 43, 226, 0.05);
        animation: cmsGlowPulse 2s infinite ease-in-out !important; 
        position: relative; z-index: 9999;
      }
      
      .cms-editable:focus { 
        border-radius: 6px !important;
        outline: 2px solid #2ecc71 !important;
        outline-offset: 6px !important; 
        background-color: rgba(46, 204, 113, 0.05); 
        box-shadow: 0 0 15px rgba(46, 204, 113, 0.3) !important;
        animation: none !important;
      }

      .cms-img-container { position: relative; display: inline-block; vertical-align: middle; max-width: 100%; transition: all 0.3s ease; }
      .cms-img-container img { cursor: crosshair; transition: all 0.3s ease; border-radius: 4px; outline: 2px solid transparent; outline-offset: 2px; }
      
      .cms-img-container:hover img { 
        transform: scale(1.02); 
        border-radius: 8px !important;
        outline: 2px solid rgba(138, 43, 226, 0.8) !important;
        outline-offset: 6px !important;
        animation: cmsGlowPulse 2s infinite ease-in-out !important;
      }

      .cms-img-overlay, .cms-block-menu { 
        position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; 
        opacity: 0; transition: opacity 0.2s; z-index: 10000; 
      }
      .cms-img-container:hover .cms-img-overlay, .cms-block:hover .cms-block-menu { opacity: 1; }
      
      .cms-btn { 
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        color: white; border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; 
        border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: ui-sans-serif, system-ui; line-height: 1;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: all 0.2s ease;
      }
      .cms-btn:hover { background: rgba(15, 23, 42, 1); transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,0.3); }
      .cms-btn-danger { background: rgba(220, 38, 38, 0.85); }
      .cms-btn-danger:hover { background: rgba(220, 38, 38, 1); }
      
      .cms-block { position: relative; }
      .cms-img-editable:hover { filter: brightness(0.9); }
      
      .cms-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; padding: 24px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 100000; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;
        font-family: ui-sans-serif, system-ui; color: #1e293b;
      }
      .cms-modal-backdrop {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.6); z-index: 99999; backdrop-filter: blur(4px);
      }
      .cms-diff-item { border-bottom: 1px solid #e2e8f0; padding: 16px 0; }
      .cms-diff-selector { color: #64748b; font-family: ui-monospace, monospace; font-size: 11px; margin-bottom: 8px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; display: inline-block; }
      .cms-diff-content { font-size: 14px; line-height: 1.5; color: #10b981; font-weight: 500; }
    `;
    document.head.appendChild(style);
  }

  enable() {
    if (this.active) return;
    if (window.location.protocol === 'file:') {
      alert('Zero-Config CMS: ES Modules are blocked on file:// protocol. Please use a local server.');
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
    });
    document.querySelectorAll('.cms-img-container').forEach(c => {
      const img = c.querySelector('img');
      c.parentNode.insertBefore(img, c);
      c.remove();
    });
    document.querySelectorAll('.cms-block-menu').forEach(m => m.remove());
    document.querySelectorAll('.cms-block').forEach(b => b.classList.remove('cms-block'));
  }

  getSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.tagName === 'META') {
        const name = el.getAttribute('name');
        const prop = el.getAttribute('property');
        if (name) return `meta[name="${name}"]`;
        if (prop) return `meta[property="${prop}"]`;
    }
    if (el.tagName === 'TITLE') return 'title';

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

  saveChange(selector, content) {
    this.changes[selector] = content;
    localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
    window.dispatchEvent(new CustomEvent('cms-changed', { detail: this.changes }));
    this.notifyParent();
  }

  applySavedChanges() {
    for (const [selector, content] of Object.entries(this.changes)) {
      const el = document.querySelector(selector);
      if (el) {
        if (!el.dataset.cmsOriginal) el.dataset.cmsOriginal = el.tagName === 'IMG' ? el.src : (el.tagName === 'META' ? el.getAttribute('content') : el.innerText);
        if (el.tagName === 'IMG') el.src = content;
        else if (el.tagName === 'META') el.setAttribute('content', content);
        else el.innerText = content;
      }
    }
    // Final notification after batch apply
    this.notifyParent();
  }

  showDiff() {
    const backdrop = document.createElement('div');
    backdrop.className = 'cms-modal-backdrop cms-ui';
    backdrop.onclick = () => backdrop.remove();

    const modal = document.createElement('div');
    modal.className = 'cms-modal cms-ui';
    modal.onclick = e => e.stopPropagation();

    modal.innerHTML = `<h3 style="margin-top:0">Local Changes</h3>`;
    const count = Object.keys(this.changes).length;
    if (count === 0) {
      modal.innerHTML += `<p style="color:#666">No changes detected yet.</p>`;
    } else {
      for (const [selector, text] of Object.entries(this.changes)) {
        const item = document.createElement('div');
        item.className = 'cms-diff-item';
        const display = text.length > 120 ? text.substring(0, 120) + '...' : text;
        item.innerHTML = `
          <div class="cms-diff-selector">${selector}</div>
          <div class="cms-diff-content">${display}</div>
        `;
        modal.appendChild(item);
      }
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cms-btn';
    closeBtn.style.marginTop = '20px';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => backdrop.remove();
    modal.appendChild(closeBtn);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  scanAndApply() {
    this.setupStyles();
    this.fixExternalImages();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const p = node.parentElement;
        if (!p || p.closest('.cms-ui') || p.closest('nav') || p.closest('button')) return NodeFilter.FILTER_REJECT;
        const ignored = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'INPUT', 'TEXTAREA', 'SELECT'];
        if (ignored.includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim() || node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while (node = walker.nextNode()) this.makeEditable(node.parentElement);

    document.querySelectorAll('img').forEach(img => {
      if (!img.closest('.cms-ui') && !img.closest('nav')) this.makeImageEditable(img);
    });

    const blockSelectors = ['main > section', '.card', 'article', '.content-section', '.feature-item', 'li'];
    document.querySelectorAll(blockSelectors.join(',')).forEach(block => {
      if (!block.closest('.cms-ui') && !block.closest('nav')) this.makeBlockActionable(block);
    });
  }

  makeEditable(el) {
    if (el.dataset.cmsReady) return;
    el.dataset.cmsReady = 'true';
    if (!el.dataset.cmsOriginal) el.dataset.cmsOriginal = el.innerText;
    
    // Resolve source file information from the element or body
    const sourceFile = el.getAttribute('data-astro-source-file') || document.body.dataset.cmsSource;
    if (sourceFile) el.dataset.cmsSource = sourceFile;

    el.classList.add('cms-editable');
    try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
    el.onblur = () => this.saveChange(this.getSelector(el), el.innerText);
    el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
  }

  makeImageEditable(img) {
    if (img.dataset.cmsReady) return;
    img.dataset.cmsReady = 'true';
    if (!img.dataset.cmsOriginal) img.dataset.cmsOriginal = img.src;
    const container = document.createElement('div');
    container.className = 'cms-img-container';
    img.parentNode.insertBefore(container, img);
    container.appendChild(img);

    const overlay = document.createElement('div');
    overlay.className = 'cms-img-overlay cms-ui';
    overlay.append(
      this.createBtn('URL', () => {
        const src = prompt('URL:', img.src);
        if (src) { img.src = src; this.saveChange(this.getSelector(img), src); }
      }),
      this.createBtn('Upload', () => this.triggerUpload(img))
    );
    container.appendChild(overlay);
  }

  makeBlockActionable(block) {
    if (block.classList.contains('cms-block')) return;
    block.classList.add('cms-block');
    const menu = document.createElement('div');
    menu.className = 'cms-block-menu cms-ui';
    menu.append(
      this.createBtn('Duplicate', () => {
        const clone = block.cloneNode(true);
        clone.classList.remove('cms-block');
        clone.querySelectorAll('.cms-ui').forEach(ui => ui.remove());
        clone.querySelectorAll('[data-cms-ready]').forEach(el => {
          delete el.dataset.cmsReady;
          el.classList.remove('cms-editable', 'cms-img-editable', 'cms-block');
        });
        block.parentNode.insertBefore(clone, block.nextSibling);
        this.scanAndApply();
      }),
      this.createBtn('Delete', () => {
        if (confirm('Permanently delete this block?')) block.remove();
      }, true)
    );
    block.appendChild(menu);
  }

  createBtn(text, onclick, danger = false) {
    const btn = document.createElement('button');
    btn.className = `cms-btn ${danger ? 'cms-btn-danger' : ''}`;
    btn.textContent = text;
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onclick();
    }, true);
    return btn;
  }

}

export default new ZeroConfigCMS();
