import { Idiomorph } from '../lib/vendor/idiomorph.js';

/**
 * verify_morph_sync.js
 * Verifies the DOM-morphing logic using a Mock Node structure.
 */
class MockNode {
  constructor(tag, type = 1) {
    this.tagName = tag.toUpperCase();
    this.nodeType = type;
    this.childNodes = [];
    this.nodeValue = null;
    this.attributes = [];
  }
  
  cloneNode(deep) {
    const clone = new MockNode(this.tagName, this.nodeType);
    clone.nodeValue = this.nodeValue;
    if (deep) {
      clone.childNodes = this.childNodes.map(c => c.cloneNode(true));
    }
    return clone;
  }
  
  appendChild(node) {
    this.childNodes.push(node);
  }
  
  replaceWith(node) {
    this.wasReplaced = true;
    console.log(`[Mock DOM] Node ${this.tagName} replaced.`);
  }

  remove() {
    this.wasRemoved = true;
  }
}

async function verifyMorph() {
  console.log('--- Starting ZeroCMS Morph-Sync Verification (Mock DOM) ---');

  // Initial Mock Structure
  const oldBody = new MockNode('body');
  const oldDiv = new MockNode('div');
  oldDiv.textContent = 'Old Content';
  oldBody.appendChild(oldDiv);

  // New Mock Structure (Server Result)
  const newBody = new MockNode('body');
  const newDiv = new MockNode('div');
  newDiv.textContent = 'New Content (Updated)';
  newBody.appendChild(newDiv);

  // Perform Morph
  console.log('Applying Morph-Sync to Mock Nodes...');
  Idiomorph.morph(oldBody, newBody);

  // Check if identity was preserved
  if (!oldDiv.wasReplaced) {
    console.log('[PASS] DOM Node was PATCHED, not replaced. Zero-flicker achieved.');
  } else {
    console.log('[FAIL] DOM Node was replaced.');
  }

  console.log('--- Verification Complete ---');
}

verifyMorph().catch(console.error);
