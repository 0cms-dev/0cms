import { rm, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";
const ASSETS = join(DIST, "assets");

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function build() {
  console.log("🚀 Starting ZeroCMS Production Build (via Bun)...");

  // 0. Ensure Tagger WASM is built
  console.log("🦀 Checking for Super Tagger WASM...");
  try {
    await readdir("lib");
    let hasWasm = false;
    let hasJs = false;
    try {
      const dirContents = await readdir("lib");
      hasWasm = dirContents.includes("zerocms_tagger_bg.wasm");
      hasJs = dirContents.includes("zerocms_tagger.js");
    } catch (e) {}

    if (!hasWasm || !hasJs) {
      console.log("⚠️ WASM files missing in lib/. Building them now...");
      const buildOutput = await execAsync("bash scripts/build_tagger.sh");
      console.log(buildOutput.stdout);
    } else {
      console.log("✅ WASM files found.");
    }
  } catch (error) {
    console.error("❌ Failed to build WASM tagger:", error);
    process.exit(1);
  }

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
      // Note: Node 18+ does not have recursive readdir natively unless node version >= 20.1
      // If CI is on Node < 20, recursive: true on readdir will fail.
      const getFiles = async (dir) => {
        const dirents = await readdir(dir, { withFileTypes: true });
        const files = await Promise.all(dirents.map((dirent) => {
          const res = join(dir, dirent.name);
          return dirent.isDirectory() ? getFiles(res) : res;
        }));
        return Array.prototype.concat(...files);
      };

      const allFiles = await getFiles(src);
      for (const filePath of allFiles) {
         // Create target dir based on relative path
         const relativePath = filePath.substring("lib/".length);
         const subDest = join(DIST, "lib", relativePath);
         const parentDir = join(DIST, "lib", relativePath.substring(0, relativePath.lastIndexOf("/")));
         await mkdir(parentDir, { recursive: true });
         await Bun.write(subDest, Bun.file(filePath));
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
