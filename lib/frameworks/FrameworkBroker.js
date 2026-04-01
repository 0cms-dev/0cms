import { DRIVERS } from './drivers/index.js';
import { ServerTrait } from './traits/ServerTrait.js';
import { RoutingTrait } from './traits/RoutingTrait.js';
import { ContentTrait } from './traits/ContentTrait.js';
import { TemplatingTrait } from './traits/TemplatingTrait.js';

/**
 * FrameworkBroker.js
 * Automatically detects the framework and hydrates the corresponding semantic driver.
 * Uses the declarative registry for easy extensibility.
 */
export class FrameworkBroker {
  constructor(webcontainer) {
    this.wc = webcontainer;
    this.activeDriver = null;
  }

  async detect() {
    const rootFiles = await this.wc.fs.readdir('/', { withFileTypes: true });
    const fileNames = rootFiles.map(e => e.name);
    
    // 1. Package Manager Detection
    let deps = {};
    
    // a. Node.js (package.json)
    if (fileNames.includes('package.json')) {
      try {
        const content = await this.wc.fs.readFile('/package.json', 'utf8');
        const pkg = JSON.parse(content);
        deps = { ...deps, ...pkg.dependencies, ...pkg.devDependencies };
      } catch (e) {}
    }

    // b. PHP (composer.json)
    if (fileNames.includes('composer.json')) {
      try {
        const content = await this.wc.fs.readFile('/composer.json', 'utf8');
        const comp = JSON.parse(content);
        deps = { ...deps, ...comp.require, ...comp['require-dev'] };
      } catch (e) {}
    }

    // c. Rust (Cargo.toml)
    if (fileNames.includes('Cargo.toml')) {
      deps['rust-cargo'] = true; // Synthetic dependency for detection
    }

    // 2. Drive selection logic - scan the Registry dynamically
    let match = null;
    for (const driver of DRIVERS) {
        const fp = driver.fingerprint || {};
        let isMatch = true;

        // 1. Dependency Check (Strict if defined)
        if (fp.dependencies && !fp.dependencies.some(d => deps[d])) {
            isMatch = false;
        }

        // 2. File Check (More lenient: requires at least 2 files or if only 1 defined, that 1)
        if (isMatch && fp.files) {
            const matchedFiles = fp.files.filter(f => fileNames.includes(f));
            const threshold = Math.min(fp.files.length, 2); 
            if (matchedFiles.length < threshold) {
                isMatch = false;
            }
        }

        // 3. Config File Check
        if (isMatch && fp.configFiles) {
            if (!fp.configFiles.some(c => fileNames.some(f => f.startsWith(c)))) {
                isMatch = false;
            }
        }

        if (isMatch) {
          console.log(`[Broker] Match found: ${driver.name}`);
          match = driver;
          break;
        }
    }

    if (match) {
        // HYDRATE: Turn plain config objects into full Trait instances
        this.activeDriver = {
            ...match,
            server: ServerTrait.from(match.server),
            routing: RoutingTrait.from(match.routing),
            content: ContentTrait.from(match.content),
            templating: TemplatingTrait.from(match.templating)
        };
        return this.activeDriver;
    }

    console.warn('[Broker] Framework not detected or no driver available.');
    return null;
  }

  getActiveDriver() {
    return this.activeDriver;
  }
}
