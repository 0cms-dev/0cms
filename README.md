# Zero-Config In-Browser CMS

A production-ready, zero-config CMS that runs a development environment (Astro, Vite, etc.) entirely in your browser using WebContainers and isomorphic-git.

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: Version 16 or higher is required.
- **GitHub OAuth App**: You need a GitHub OAuth App or GitHub App to handle authentication.

### 2. Configuration
Create a `.env` file in the root directory and add your GitHub credentials:
```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

### 3. Installation
Install the necessary dependencies (optional, but recommended for development):
```bash
npm install
```

### 4. Running the CMS
Start the local development server:
```bash
npm start
```
By default, the CMS will be available at [http://localhost:3000/](http://localhost:3000/).

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

## 🤝 Contributing

We welcome contributions! To get started:
1. **Fork** the repository.
2. **Setup** your local `.env` with GitHub OAuth credentials.
3. **Develop** your feature or fix.
4. **Submit** a Pull Request with a clear description of the changes.

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
