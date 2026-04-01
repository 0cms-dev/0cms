/**
 * django.js
 * Django (Python/Pyodide) Declarative Driver for ZeroCMS.
 */
export default {
  id: 'django',
  name: 'Django',
  fingerprint: {
    files: ['manage.py', 'requirements.txt'],
  },
  server: {
    command: 'python manage.py runserver',
    port: 8000,
  },
  routing: {
    contentPaths: ['templates', 'static'],
  },
  content: {
    fileTypes: ['.html', '.py'],
  }
};
