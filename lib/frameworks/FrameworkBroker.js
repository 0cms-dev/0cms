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

    // 2. Drive selection logic - scan the Registry
    let match = null;
    for (const driver of DRIVERS) {
        if (driver.id === 'astro' && (deps['astro'] || fileNames.some(f => f.startsWith('astro.config.')))) {
            match = driver; break;
        }
        if (driver.id === 'hexo' && (deps['hexo'] || fileNames.includes('_config.yml'))) {
            match = driver; break;
        }
        if (driver.id === 'nextjs' && (deps['next'] || fileNames.some(f => f.startsWith('next.config.')))) {
            match = driver; break;
        }
        if (driver.id === 'vite' && (deps['vite'] || fileNames.some(f => f.startsWith('vite.config.')))) {
            match = driver; break;
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
