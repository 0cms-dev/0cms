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
    
    // 1. Dependency check (package.json)
    let packageJson = {};
    if (fileNames.includes('package.json')) {
      try {
        const content = await this.wc.fs.readFile('/package.json', 'utf8');
        packageJson = JSON.parse(content);
      } catch (e) {
        console.warn('[Broker] Could not parse package.json');
      }
    }
    
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // 2. Drive selection logic - scan the Registry dynamically
    let match = null;
    for (const driver of DRIVERS) {
        const fp = driver.fingerprint || {};
        const hasDep = fp.dependencies?.some(d => deps[d]);
        const hasFile = fp.files?.some(f => fileNames.includes(f));
        const hasConfig = fp.configFiles?.some(c => fileNames.some(f => f.startsWith(c)));
        
        if (hasDep || hasFile || hasConfig) {
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
