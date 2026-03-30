import esbuild from 'esbuild';
import fs from 'fs/promises';
import path from 'path';

const DIST = 'dist';
const ASSETS = path.join(DIST, 'assets');

async function build() {
  console.log('🚀 Starting ZeroCMS Production Build...');

  // 1. Clean and Create Directories
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(ASSETS, { recursive: true });
  await fs.mkdir(path.join(DIST, 'lib'), { recursive: true });

  // 2. Bundle Dashboard App
  console.log('📦 Bundling app... ');
  const result = await esbuild.build({
    entryPoints: ['app.js'],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: 'esm',
    target: ['es2020'],
    outfile: path.join(ASSETS, 'app.bundle.js'),
    external: ['/lib/*'], // Keep libs external if they are loaded via absolute paths
  });

  // 3. Copy Static Libraries
  console.log('📂 Copying libraries...');
  const libs = await fs.readdir('lib');
  for (const lib of libs) {
    await fs.copyFile(path.join('lib', lib), path.join(DIST, 'lib', lib));
  }

  // 4. Transform index.html for Production
  console.log('📄 Processing index.html...');
  let html = await fs.readFile('index.html', 'utf8');
  
  // Replace the dev script tag with the production bundle
  html = html.replace(
    '<script type="module" src="./app.js"></script>',
    '<script type="module" src="./assets/app.bundle.js"></script>'
  );

  await fs.writeFile(path.join(DIST, 'index.html'), html);

  // 5. Copy other essential files
  console.log('📋 Copying configuration files...');
  await fs.copyFile('_headers', path.join(DIST, '_headers'));
  
  // Optional: Copy examples if needed for deployment preview
  // await fs.cp('examples', path.join(DIST, 'examples'), { recursive: true });

  console.log('✨ Build complete! Production files are in the /dist directory.');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
