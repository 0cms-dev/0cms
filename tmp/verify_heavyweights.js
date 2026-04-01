import { FrameworkBroker } from '../lib/frameworks/FrameworkBroker.js';

/**
 * verify_heavyweights.js
 * Verification test for Full-Stack Framework detection (WordPress, Laravel, Django).
 */
async function runVerification() {
  console.log('--- Starting ZeroCMS Heavyweight Framework Verification ---');

  const cases = [
    { name: 'WordPress', files: ['wp-config.php', 'wp-settings.php', 'wp-content'] },
    { name: 'Laravel', files: ['artisan', 'composer.json'], content: { require: { 'laravel/framework': 'latest' } } },
    { name: 'Django', files: ['manage.py', 'requirements.txt'] },
    { name: 'Zola', files: ['config.toml', 'content', 'templates', 'static'] },
    { name: 'Fresh', files: ['deno.json', 'fresh.gen.ts'] }
  ];

  for (const testCase of cases) {
    const mockWC = {
      fs: {
        readFile: async (path) => {
            if (path === '/package.json') return '{}';
            if (path === '/composer.json' && testCase.content) {
                return JSON.stringify(testCase.content);
            }
            if (path === '/manage.py' || path === '/wp-config.php' || path === '/artisan') return '';
            throw new Error('File not found');
        },
        readdir: async () => testCase.files.map(f => ({ name: f, isDirectory: () => false }))
      }
    };

    const broker = new FrameworkBroker(mockWC);
    const driver = await broker.detect();

    if (driver && driver.name === testCase.name) {
      console.log(`[PASS] Correctly detected: ${testCase.name}`);
    } else {
      console.log(`[FAIL] Expected ${testCase.name}, but got ${driver ? driver.name : 'Unknown'}`);
    }
  }

  console.log('--- Verification Complete ---');
}

runVerification().catch(console.error);
