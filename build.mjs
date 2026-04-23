import { rm, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");

async function build() {
  console.log("🚀 Starting ZeroCMS Production Build (via Bun)...");

  // 1. Clean and Create Directories
  await rm(DIST, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });
  await mkdir(join(DIST, "lib"), { recursive: true });

  // 2. Bundle Dashboard App
  console.log("📦 Bundling app... ");
  const result = await Bun.build({
    entrypoints: ["app.js"],
    outdir: ASSETS,
    naming: "app-[hash].js",
    minify: true,
    sourcemap: "external",
    target: "browser",
    external: ["/lib/*"], 
  });

  if (!result.success) {
    console.error("❌ Bundle failed:", result.logs);
    process.exit(1);
  }

  // 3. Copy Static Libraries
  console.log("📂 Copying libraries...");
  const libs = await readdir("lib", { withFileTypes: true });
  for (const lib of libs) {
    const src = join("lib", lib.name);
    const dest = join(DIST, "lib", lib.name);
    if (lib.isDirectory()) {
      await mkdir(dest, { recursive: true });
      // Very basic recursive copy for directories
      const subLibs = await readdir(src, { recursive: true, withFileTypes: true });
      for (const sub of subLibs) {
        if (sub.isFile()) {
           const subSrc = join(sub.parentPath, sub.name);
           const subDest = join(DIST, sub.parentPath, sub.name);
           await mkdir(join(DIST, sub.parentPath), { recursive: true });
           await Bun.write(subDest, Bun.file(subSrc));
        }
      }
    } else {
      await Bun.write(dest, Bun.file(src));
    }
  }

  // Extract the generated hashed file name from Bun's output
  const jsOutput = result.outputs.find(out => out.path.endsWith('.js'));
  const hashedFilename = jsOutput.path.split('/').pop();

  // 4. Transform index.html for Production
  console.log("📄 Processing index.html...");
  let html = await Bun.file("index.html").text();
  
  // Replace the dev script tag with the ABSOLUTE production bundle path (cache busted)
  html = html.replace(
    '<script type="module" src="/app.js"></script>',
    `<script type="module" src="/assets/${hashedFilename}"></script>`
  );

  await Bun.write(join(DIST, "index.html"), html);

  // 5. Copy other essential files
  console.log("📋 Copying configuration files...");
  await Bun.write(join(DIST, "_headers"), Bun.file("_headers"));

  console.log("✨ Build complete! Production files are in the /dist directory.");
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
