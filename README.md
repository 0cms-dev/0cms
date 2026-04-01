# Zero-Config In-Browser CMS

> [!WARNING]
> **Work in Progress (Alpha)**: ZeroCMS is an experimental project. Many features are partially implemented, and you may encounter bugs. We are currently building the core engine—expect breaking changes.

<a href="https://github.com/apps/0cms-dev/installations/new">
  <img src="https://img.shields.io/badge/Install_0CMS-GitHub_App-black?style=for-the-badge&logo=github" alt="Install 0CMS" height="40" />
</a>

A production-ready, zero-config CMS that runs a development environment (Astro, Vite, etc.) entirely in your browser using WebContainers and isomorphic-git.

## 📖 Documentation

None. It's Zero-Config.

## Getting Started

ZeroCMS is designed to be completely zero-setup. You don't need to configure `.env` files, databases, or local development environments.

1.  **Install the GitHub App**: [Install 0CMS on your repositories](https://github.com/apps/0cms-dev/installations/new).
2.  **Authorize**: Approve the App to grant access to the projects you want to manage.
3.  **Edit**: Select a repository. Our engine boots your site directly in the browser—start visually editing instantly!

## How it works

## 🛠 Features

- **In-Browser Dev Server**: Runs Node.js directly in the browser via WebContainers.
- **Zero-Config**: No backend required; uses isomorphic-git for Git operations.
- **Visual Editing**: Directly modify your site's content in an iframe.
- **Persistent Storage**: Uses `lightning-fs` to keep your repository in IndexedDB.
- **Seamless Publishing**: Commits and pushes changes directly to GitHub.

### 🚧 Work in Progress / Next Steps
1. **Responsive Preview**: Test website across Mobile, Tablet, and Desktop directly in the dashboard. (Current Focus)
2. **Content Creation**: Generate new pages or list items (e.g., from Markdown templates).
3. **SEO & Assets**: Meta-editor for OpenGraph tags and a central Media Library.
4. **One-Click Deploy**: Automated deployments via Vercel/Cloudflare integration.

- `index.html`: The modern dashboard for managing your repositories.
- `WebContainerGitService.js`: The core logic for Git and WebContainer orchestration.
- `cms.js`: The visual editor bridge that runs inside the preview iframe.
- `serve.js`: A simple Node.js server providing COOP/COEP headers.
- `.env`: (Ignored) Contains your GitHub credentials.

## 🏗 Architecture

ZeroCMS uses a unique high-performance architecture:
- **Quantum Boot**: Background pre-warming of WebContainers before the user even opens the dashboard.
- **Visual Bridge**: A zero-config postMessage bridge that allows the host to edit the iframe content in-place.
- **Binary Snapshots**: Uses `tar` blobs in IndexedDB to skip `npm install` for previously loaded repositories.

## 🛡️ Security & Sandboxing

ZeroCMS is designed with a **Zero-Trust** security model. Running untrusted code (like `npm run dev`) from a third-party repository is safer here than on your local machine:

1. **Browser Sandbox**: The entire Node.js runtime (WebContainer) executes inside the browser's security sandbox.
2. **Total Isolation**: Malicious scripts cannot "break out" of the browser tab. They have **no access** to your local files, system registry, passwords, or local network.
3. **Disposable Environments**: Every session is isolated. If a repository contains harmful code, it only affects its own virtual filesystem within that specific tab. Closing the tab wipes the environment completely.

## 🚀 Framework Support

ZeroCMS uses a **Declarative Driver** system. While the engine is designed to be universal, specific support is being built out one-by-one.

- **Stable**: Astro, Hexo, Generic Vite (Static).
- **Experimental**: Next.js (Static Export), Eleventy.
- **Planned / Stubs**: Nuxt, SvelteKit, Remix, Hugo (Go-WASM required).

## 🏗 Modular Architecture ("Architectural Gold")

We strive for what we call "Architectural Gold"—patterns that are clean, modular, and highly performant. However, we are still refining these implementations:

1.  **Deterministic Traceability**: Using invisible Unicode breadcrumbs to map rendered DOM elements back to their exact source file and line number with 100% accuracy.
2.  **Hybrid WASM Core**: A pluggable engine that uses **JavaScript** for instant starts on small projects and switches to **Rust (WASM)** for massive monorepos. (Note: Rust binary is currently in development).
3.  **Quantum Pre-warming**: The WebContainer engine starts booting the second you hit the landing page, ensuring the dashboard is ready before you even finish logging in.
4.  **Zero-Copy Memory**: Using `SharedArrayBuffer` and `TypedArrays` to share project data between the UI and the WASM engine without slow serialization.

## ⚠️ Current Limitations (Be Aware)

- **Mocked WASM**: The high-performance Rust tagger is currently mocked via a JavaScript fallback.
- **Parsing Fidelity**: Complex template logic (nested Nunjucks/Liquid) may still struggle with edge cases during tagging.
- **Static Only**: We currently focus on SSG (Static Site Generation). SSR (Server Side Rendering) support within the preview is limited.
- **Git Conflicts**: Automated conflict resolution during "Publish" is still manual.

## 🤝 Contributing & Self-Hosting

ZeroCMS is an open-source project. If you wish to self-host or contribute to the core:

1. **Install Bun**: [Bun.sh](https://bun.sh/) is required for development and building.
2. **Fork & Clone** the repository.
3. **Setup** a `.env` file with your own `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from a custom GitHub OAuth App.
4. **Run** `bun install` && `bun start`. The dev environment runs on `localhost:3000`.
5. **Build** for production via `bun run build`. The output will be in the `/dist` directory.
6. **Develop** your feature or fix and submit a PR!

Please ensure your code follows the existing minimalist aesthetic and uses vanilla JS/CSS where possible.

## ❤️ Sponsors

ZeroCMS is an open-source project. If you find it useful, please consider supporting its development:
- **GitHub Sponsors**: [Support our work](https://github.com/sponsors/megawron)
- **Open Collective**: [Join our community](https://opencollective.com/0cms)

## ⚠️ Important Note on WebContainers

WebContainers require specific HTTP headers to function correctly:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

The included `serve.js` automatically provides these headers. If you deploy this to a production environment (e.g., Vercel, Netlify), you must configure these headers in your platform's settings.

## 📄 License

MIT
