import { Idiomorph } from '../vendor/idiomorph.js';

/**
 * IframeSyncService.js
 * The ZeroCMS Paradox-Free Synchronization Service.
 * 
 * Moving from global DOM reconciliation to chirurgical, fragment-level 
 * patching based on Unicode Marker IDs.
 */
export class IframeSyncService {
  static instance = null;

  static getInstance() {
    if (!this.instance) this.instance = new IframeSyncService();
    return this.instance;
  }

  /**
   * Performs an asynchronous, flicker-free sync of a specific DOM fragment.
   * COMPATIBILITY: Uses postMessage to avoid Cross-Origin SecurityErrors.
   */
  async sync(iframe, url, markerId = null) {
    if (!iframe) return;

    try {
      console.log(`[SyncService] Fetching silent updates (Target: ${markerId || 'Whole Body'})`);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch new rendering.');
      
      const htmlText = await response.text();
      
      // We no longer manipulate the iframe DOM from here.
      // Instead, we delegate the morphing to the bridge INSIDE the iframe.
      iframe.contentWindow.postMessage({
          type: 'CMS_SYNC_FRAG',
          html: htmlText,
          markerId: markerId
      }, '*');

    } catch (e) {
      console.warn('[SyncService] PostMessage-Sync failed. Fallback to hard reload.', e.message);
      iframe.src = url; // Hard fallback
    }
  }

  /**
   * Locates a DOM element that contains our unique Unicode Marker ID.
   * This is the "Magic Sauce" that allows chirurgical patching.
   */
  findElementByMarker(root, markerId) {
    // Unicode Marker format: \u200B\u200C + markerId + \u200C
    const markerString = `\u200B\u200C${markerId}\u200C`;
    
    // We search through all elements to find the most specific container
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.includes(markerString)) {
            // Return the parent element as the morph target
            return node.parentElement;
        }
    }
    return null;
  }

  syncMetadata(oldDoc, newDoc) {
    if (oldDoc.title !== newDoc.title) {
        oldDoc.title = newDoc.title;
    }
  }
}
