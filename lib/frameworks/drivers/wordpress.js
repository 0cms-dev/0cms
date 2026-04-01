/**
 * wordpress.js
 * WordPress (PHP-WASM) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'wordpress',
  name: 'WordPress',
  fingerprint: {
    files: ['wp-config.php', 'wp-settings.php'],
  },
  server: {
    command: 'php-wasm serve', // PHP-WASM specific runtime
    port: 8080,
  },
  routing: {
    contentPaths: ['wp-content/themes', 'wp-content/plugins'],
    extensions: ['.php', '.css', '.js'],
  },
  content: {
    fileTypes: ['.php', '.html'],
  }
};
