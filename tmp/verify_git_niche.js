import { FrameworkBroker } from '../lib/frameworks/FrameworkBroker.js';

/**
 * verify_git_niche.js
 * Verification test for Git-Based Content Frameworks (Zola, Fresh, Hugo, etc.).
 * Ensures that database-reliant drivers are correctly removed.
 */
async function runVerification() {
  console.log('--- Starting ZeroCMS Git-Niche Verification ---');

  const cases = [
    { name: 'Zola', files: ['config.toml', 'content', 'templates', 'static'] },
    { name: 'Fresh', files: ['deno.json', 'fresh.gen.ts'] },
    { name: 'Astro', files: ['astro.config.mjs', 'src', 'public', 'package.json'] }
  ];

  for (const testCase of cases) {
    const mockWC = {
      fs: {
        readFile: async (path) => {
            if (path === '/package.json') return JSON.stringify({ dependencies: { 'astro': 'latest' } });
            if (path === '/astro.config.mjs') return 'export default {}';
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

  // ANTI-REGRESSION: Ensure WordPress/Laravel/Django are NO LONGER detected
  const dbCases = [
    { name: 'WordPress', files: ['wp-config.php', 'wp-settings.php', 'wp-content'] },
    { name: 'Laravel', files: ['artisan', 'composer.json'] }
  ];

  for (const testCase of dbCases) {
    const mockWC = {
      fs: {
        readFile: async () => '',
        readdir: async () => testCase.files.map(f => ({ name: f, isDirectory: () => false }))
      }
    };
    const broker = new FrameworkBroker(mockWC);
    const driver = await broker.detect();
    
    if (!driver || driver.name === 'Generic Vite') {
        console.log(`[PASS] Correctly ignored non-Git framework: ${testCase.name}`);
    } else {
        console.log(`[FAIL] Still matching excluded framework: ${testCase.name} (detected as ${driver.name})`);
    }
  }

  console.log('--- Verification Complete ---');
}

runVerification().catch(console.error);
