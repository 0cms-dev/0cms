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
By default, the CMS will be available at [http://localhost:3000/admin.html](http://localhost:3000/admin.html).

## 🛠 Features

- **In-Browser Dev Server**: Runs Node.js directly in the browser via WebContainers.
- **Zero-Config**: No backend required; uses isomorphic-git for Git operations.
- **Visual Editing**: Directly modify your site's content in an iframe.
- **Persistent Storage**: Uses `lightning-fs` to keep your repository in IndexedDB.
- **Seamless Publishing**: Commits and pushes changes directly to GitHub.

## 📁 Project Structure

- `admin.html`: The main dashboard for managing your repositories.
- `WebContainerGitService.js`: The core logic for Git and WebContainer orchestration.
- `cms.js`: The visual editor script that runs inside the preview iframe.
- `serve.js`: A simple Node.js server that provides the required COOP/COEP headers.
- `.env`: (Ignored) Contains your GitHub credentials.

## ⚠️ Important Note on WebContainers

WebContainers require specific HTTP headers to function correctly:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

The included `serve.js` automatically provides these headers. If you deploy this to a production environment (e.g., Vercel, Netlify), you must configure these headers in your platform's settings.

## 📄 License

MIT
