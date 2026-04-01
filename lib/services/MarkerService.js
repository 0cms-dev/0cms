/**
 * MarkerService.js
 * Encodes and Decodes source metadata (FileID, LineNumber) into 
 * invisible Unicode characters (Zero-Width Steganography).
 */
export class MarkerService {
  static START = '\uFEFF'; 
  static ZERO = '\u200B';   // Bit 0
  static ONE = '\u200C';    // Bit 1
  static SEP = '\u200D';    // Bit Separator
  static END = '\uFEFF';

  /**
   * Encodes numeric IDs into a sequence of invisible bits.
   * Example: encode(12, 45) -> \uFEFF...bits...\uFEFF
   */
  static encode(fileId, line) {
    const binFile = fileId.toString(2);
    const binLine = line.toString(2);
    
    let encoded = this.START;
    
    // Encode FileID bits
    for (let bit of binFile) {
      encoded += (bit === '1' ? this.ONE : this.ZERO);
    }
    
    encoded += this.SEP; // Separator
    
    // Encode Line bits
    for (let bit of binLine) {
      encoded += (bit === '1' ? this.ONE : this.ZERO);
    }
    
    encoded += this.END;
    return encoded;
  }

  /**
   * Decodes a string containing a breadcrumb.
   */
  static decode(str) {
    const regex = new RegExp(`${this.START}([${this.ZERO}${this.ONE}${this.SEP}]+)${this.END}`, 'g');
    const matches = [...str.matchAll(regex)];
    if (!matches.length) return null;

    const payload = matches[0][1];
    const parts = payload.split(this.SEP);
    if (parts.length !== 2) return null;

    const fileId = parseInt(parts[0].split('').map(c => c === this.ONE ? '1' : '0').join(''), 2);
    const line = parseInt(parts[1].split('').map(c => c === this.ONE ? '1' : '0').join(''), 2);

    return { fileId, line };
  }

  /**
   * Strips all markers from a string for clean saving.
   */
  static strip(str) {
    if (!str) return '';
    const regex = new RegExp(`[${this.START}${this.ZERO}${this.ONE}${this.SEP}${this.END}]`, 'g');
    return str.replace(regex, '');
  }

  /**
   * Helper to wraps a string with a marker.
   */
  static wrap(text, fileId, line) {
    const marker = this.encode(fileId, line);
    return marker + text;
  }
}
