/**
 * laravel.js
 * Laravel (PHP-WASM) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'laravel',
  name: 'Laravel',
  fingerprint: {
    dependencies: ['laravel/framework'],
    files: ['artisan', 'composer.json']
  },
  server: {
    command: 'php artisan serve',
    port: 8000,
  },
  routing: {
    contentPaths: ['resources/views', 'routes'],
    extensions: ['.blade.php', '.php']
  },
  content: {
    fileTypes: ['.blade.php', '.php', '.md']
  }
};
