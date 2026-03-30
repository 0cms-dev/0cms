/**
 * Frameworks.js
 * Registry of framework profiles for Zero-Config CMS.
 * Each profile defines its own signals for detection, default commands, and ports.
 */
export const FRAMEWORKS = [
  {
    id: 'nextjs',
    name: 'Next.js',
    signals: {
      deps: ['next'],
      files: ['next.config.js', 'next.config.mjs']
    },
    defaults: {
      command: 'npx next dev',
      port: 3000,
      contentPaths: ['/pages', '/app', '/src/pages', '/src/app', '/content', '/src/content']
    }
  },
  {
    id: 'hexo',
    name: 'Hexo',
    signals: {
      deps: ['hexo', 'hexo-cli'],
      files: ['_config.yml', 'scaffolds']
    },
    defaults: {
      command: 'npx hexo server',
      port: 4000,
      contentPaths: ['/source/_posts', '/source']
    },
    tagger: () => `
hexo.extend.filter.register('after_render:html', function(html, data) {
  if (data.source) {
    const sourcePath = 'source/' + data.source;
    return html.replace('<body', '<body data-cms-source="' + sourcePath + '"');
  }
  return html;
});
`
  },
  {
    id: 'astro',
    name: 'Astro',
    signals: {
      deps: ['astro'],
      files: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js']
    },
    defaults: {
      command: 'npx astro dev',
      port: 4321,
      contentPaths: ['/src/content', '/src/pages', '/content']
    }
  },
  {
    id: 'hugo',
    name: 'Hugo',
    signals: {
      files: ['hugo.toml', 'config.toml', 'hugo.yaml', 'config.yaml', 'hugo.json', 'config.json']
    },
    defaults: {
      command: 'hugo server --bind 0.0.0.0 --appendPort=false',
      port: 1313,
      contentPaths: ['/content']
    }
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    signals: {
      deps: ['nuxt', 'nuxt3'],
      files: ['nuxt.config.js', 'nuxt.config.ts']
    },
    defaults: {
      command: 'npx nuxi dev',
      port: 3000,
      contentPaths: ['/content', '/pages']
    }
  },
  {
    id: 'eleventy',
    name: 'Eleventy',
    signals: {
      deps: ['@11ty/eleventy'],
      files: ['.eleventy.js', 'eleventy.config.js']
    },
    defaults: {
      command: 'npx @11ty/eleventy --serve',
      port: 8080,
      contentPaths: ['/content', '/posts', '/src']
    }
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    signals: {
      deps: ['@sveltejs/kit'],
      files: ['svelte.config.js']
    },
    defaults: {
      command: 'npx vite dev',
      port: 5173,
      contentPaths: ['/src/routes', '/content']
    }
  },
  {
    id: 'jekyll',
    name: 'Jekyll',
    signals: {
      files: ['_config.yml', 'Gemfile']
    },
    defaults: {
      command: 'bundle exec jekyll serve --host 0.0.0.0',
      port: 4000,
      contentPaths: ['/_posts', '/pages']
    }
  },
  {
    id: 'vitepress',
    name: 'VitePress',
    signals: {
      deps: ['vitepress'],
      files: ['.vitepress/config.js', '.vitepress/config.ts']
    },
    defaults: {
      command: 'npx vitepress dev',
      port: 5173,
      contentPaths: ['/docs', '/src']
    }
  },
  {
    id: 'zola',
    name: 'Zola',
    signals: {
      files: ['config.toml']
    },
    defaults: {
      command: 'zola serve --interface 0.0.0.0',
      port: 1111,
      contentPaths: ['/content']
    }
  }
];

export const GENERIC_VITE = {
  id: 'vite',
  name: 'Vite (Generic)',
  signals: {
    deps: ['vite'],
    files: ['vite.config.js', 'vite.config.ts']
  },
  defaults: {
    command: 'npx vite',
    port: 5173,
    contentPaths: ['/src']
  }
};
