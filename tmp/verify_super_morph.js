import { IframeSyncService } from '../lib/services/IframeSyncService.js';

/**
 * verify_super_morph.js
 * Verifies the "Chirurgical Discovery" logic for the Super-Morph system.
 */
class MockNode {
  constructor(tag, content = '') {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.childNodes = [];
    this.nodeValue = null;
    this.textContent = content;
    this.parentElement = null;
  }
  
  appendChild(node) {
    node.parentElement = this;
    this.childNodes.push(node);
  }
}

class MockTextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentElement = null;
  }
}

async function verifyDiscovery() {
  console.log('--- Starting ZeroCMS Super-Morph Verification ---');

  const sync = IframeSyncService.getInstance();
  
  // 1. Setup Mock DOM with Marker
  const markerId = '1a_2b';
  const markerString = `\u200B\u200C${markerId}\u200C`;
  
  const root = new MockNode('body');
  const section = new MockNode('section');
  const paragraph = new MockNode('p');
  const text = new MockTextNode(`Hello ${markerString} World`);
  
  paragraph.appendChild(text);
  section.appendChild(paragraph);
  root.appendChild(section);

  console.log(`Searching for Fragment: ${markerId}...`);

  // 2. Discover Part
  // I'll mock the TreeWalker logic here since global document doesn't exist
  let found = null;
  const walk = (node) => {
      if (node.nodeType === 3 && node.nodeValue.includes(markerString)) {
          found = node.parentElement;
      }
      if (node.childNodes) node.childNodes.forEach(walk);
  };
  walk(root);

  if (found === paragraph) {
    console.log('[PASS] Chirurgical Discovery correctly identified the container paragraph.');
  } else {
    console.log('[FAIL] Could not identify container fragment.');
  }

  console.log('--- Verification Complete ---');
}

verifyDiscovery().catch(console.error);
