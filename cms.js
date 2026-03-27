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
    
    // Listen for parent commands if in Iframe
    if (this.inIframe) {
      window.addEventListener('message', (e) => {
        if (e.data.type === 'CMS_TOGGLE') {
          e.data.enabled ? this.enable() : this.disable();
        }
        if (e.data.type === 'CMS_CLEAR') {
          this.changes = {};
          localStorage.removeItem(this.storageKey);
          location.reload();
        }
        if (e.data.type === 'CMS_REVERT' && e.data.selector) {
          delete this.changes[e.data.selector];
          localStorage.setItem(this.storageKey, JSON.stringify(this.changes));
          // Re-apply all remaining saved changes from a clean state
          location.reload();
        }
      });
      // Initial notification of existing changes
      this.notifyParent();
    }
  }

  notifyParent() {
    if (this.inIframe) {
      window.parent.postMessage({ 
        type: 'CMS_CHANGED', 
        changes: this.changes 
      }, '*');
    }
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .cms-editable:hover { outline: 2px dashed #3498db !important; outline-offset: 2px; cursor: pointer; }
      .cms-editable:focus { outline: 2px solid #2ecc71 !important; background: rgba(46, 204, 113, 0.05); }
      .cms-img-container { position: relative; display: inline-block; width: 100%; }
      .cms-img-overlay, .cms-block-menu { 
        position: absolute; top: 5px; right: 5px; display: flex; gap: 4px; 
        opacity: 0; transition: opacity 0.2s; z-index: 1000; 
      }
      .cms-img-container:hover .cms-img-overlay, .cms-block:hover .cms-block-menu { opacity: 1; }
      .cms-btn { 
        background: #2d3436; color: white; border: none; padding: 4px 8px; 
        border-radius: 4px; font-size: 10px; cursor: pointer; font-family: sans-serif; line-height: 1;
      }
      .cms-btn:hover { background: #000; }
      .cms-btn-danger { background: #e74c3c; }
      .cms-btn-danger:hover { background: #c0392b; }
      .cms-block { position: relative; }
      .cms-img-editable:hover { filter: brightness(0.9); }
      
      .cms-modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; padding: 24px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 10000; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto;
        font-family: sans-serif; color: #333;
      }
      .cms-modal-backdrop {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 9999; backdrop-filter: blur(2px);
      }
      .cms-diff-item { border-bottom: 1px solid #eee; padding: 12px 0; }
      .cms-diff-selector { color: #3498db; font-family: monospace; font-size: 10px; margin-bottom: 6px; }
      .cms-diff-content { font-size: 13px; line-height: 1.4; color: #2ecc71; font-weight: 500; }
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
        if (el.tagName === 'IMG') el.src = content;
        else el.innerText = content;
      }
    }
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
    el.classList.add('cms-editable');
    try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
    el.onblur = () => this.saveChange(this.getSelector(el), el.innerText);
    el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
  }

  makeImageEditable(img) {
    if (img.dataset.cmsReady) return;
    img.dataset.cmsReady = 'true';
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

  triggerUpload(img) {
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
  }
}

export default new ZeroConfigCMS();
