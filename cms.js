/**
 * ZeroConfigCMS - A lightweight, in-place DOM editor.
 */
class ZeroConfigCMS {
  constructor() {
    this.active = false;
    this.styleId = 'cms-styles';
    this.setupStyles();
  }

  setupStyles() {
    if (document.getElementById(this.styleId)) return;
    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .cms-editable:hover {
        outline: 2px dashed #3498db !important;
        outline-offset: 4px;
        cursor: pointer;
      }
      .cms-editable:focus {
        outline: 2px solid #2ecc71 !important;
        outline-offset: 4px;
        background: rgba(46, 204, 113, 0.05);
      }
      .cms-img-editable {
        transition: filter 0.2s;
      }
      .cms-img-editable:hover {
        filter: brightness(0.8) sepia(0.2);
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.scanAndApply();
  }

  scanAndApply() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Exclude script, style, code, etc.
          const ignoredTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'NAV', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'];
          if (ignoredTags.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;

          // Exclude header/footer if they are likely part of UI protection (nav check already covers most)
          // But let's be more specific about "Content"
          const text = node.textContent.trim();
          if (text.length === 0) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.nextNode() || walker.currentNode); 
    // Wait, the while(walker.nextNode()) already moves it.
    // Correct way:
    /*
    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }
    */
    
    // Actually, I'll just process them directly to be more performant
    const textNodes = [];
    let currentNode;
    const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        const ignoredTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'NAV', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'HEADER', 'FOOTER'];
        if (parent.closest('nav') || ignoredTags.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (currentNode = walker2.nextNode()) {
      this.makeEditable(currentNode.parentElement);
    }

    // Images
    document.querySelectorAll('img').forEach(img => {
      if (img.closest('nav') || img.closest('button')) return;
      img.classList.add('cms-img-editable');
      img.addEventListener('click', (e) => this.handleImageClick(e));
    });
  }

  makeEditable(el) {
    if (el.dataset.cmsReady) return;
    el.dataset.cmsReady = 'true';
    el.classList.add('cms-editable');
    
    // Use plaintext-only for modern browsers if available
    try {
      el.contentEditable = 'plaintext-only';
    } catch (e) {
      el.contentEditable = 'true';
    }

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      }
    });

    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  handleImageClick(e) {
    const img = e.target;
    const newSrc = prompt('Enter new image URL:', img.src);
    if (newSrc && newSrc !== img.src) {
      img.src = newSrc;
    }
  }
}

export default new ZeroConfigCMS();
