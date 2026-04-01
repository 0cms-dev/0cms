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
   * If markerId is not provided, falls back to full body morph.
   */
  async sync(iframe, url, markerId = null) {
    if (!iframe || !iframe.contentDocument) return;

    try {
      console.log(`[SyncService] Fetching silent updates (Target: ${markerId || 'Whole Body'})`);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch new rendering.');
      
      const htmlText = await response.text();
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(htmlText, 'text/html');

      // 1. CHIRURGICAL FRAGMENT DISCOVERY
      if (markerId) {
          const targetInNew = this.findElementByMarker(newDoc.body, markerId);
          const targetInOld = this.findElementByMarker(iframe.contentDocument.body, markerId);
          
          if (targetInNew && targetInOld) {
              console.log(`[SyncService] Fragment-Match found for marker: ${markerId}. Patching...`);
              requestAnimationFrame(() => {
                  Idiomorph.morph(targetInOld, targetInNew);
                  // Ensure we also sync page-wide changes (title, etc)
                  this.syncMetadata(iframe.contentDocument, newDoc);
              });
              return;
          }
          console.warn(`[SyncService] Fragment-Match failed for marker: ${markerId}. Falling back to body-morph.`);
      }

      // 2. FAIL-SAFE: FULL BODY MORPH
      requestAnimationFrame(() => {
        Idiomorph.morph(iframe.contentDocument.body, newDoc.body);
        this.syncMetadata(iframe.contentDocument, newDoc);
        console.log('[SyncService] Flicker-free body morph completed.');
      });

    } catch (e) {
      console.warn('[SyncService] Morph-Sync failed. Fallback to hard reload.', e.message);
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
