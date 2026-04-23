import fs from 'fs';
import path from 'path';

async function generateDummyDir(dirPath, depth, filesPerDir) {
  await fs.promises.mkdir(dirPath, { recursive: true }).catch(() => {});
  if (depth === 0) return;

  const promises = [];
  for (let i = 0; i < filesPerDir; i++) {
    const fileNum = i;
    promises.push(fs.promises.writeFile(path.join(dirPath, `file_${fileNum}.txt`), `hello ${fileNum}`));
  }
  for (let i = 0; i < filesPerDir; i++) {
    const subDir = path.join(dirPath, `dir_${i}`);
    promises.push(generateDummyDir(subDir, depth - 1, filesPerDir));
  }
  await Promise.all(promises);
}

// Current implementation
async function wipeDirOriginal(dir) {
  try {
    const entries = await fs.promises.readdir(dir);
    for (const entry of entries) {
      const p = path.join(dir, entry);
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) {
        await wipeDirOriginal(p);
        await fs.promises.rmdir(p);
      } else {
        await fs.promises.unlink(p);
      }
    }
  } catch (e) {
  }
}

// Optimized implementation
async function wipeDirOptimized(dir) {
  try {
    const entries = await fs.promises.readdir(dir);
    await Promise.all(entries.map(async (entry) => {
      const p = path.join(dir, entry);
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) {
        await wipeDirOptimized(p);
        await fs.promises.rmdir(p);
      } else {
        await fs.promises.unlink(p);
      }
    }));
  } catch (e) {
  }
}

async function runBenchmark() {
  const dir1 = './testdir1';
  const dir2 = './testdir2';

  console.log("Generating dummy directories...");
  await generateDummyDir(dir1, 4, 5); // 5 files + 5 dirs, depth 4
  await generateDummyDir(dir2, 4, 5);
  console.log("Generation complete.");

  console.log("Testing original...");
  const t1 = performance.now();
  await wipeDirOriginal(dir1);
  const t2 = performance.now();
  console.log(`Original: ${t2 - t1}ms`);

  console.log("Testing optimized...");
  const t3 = performance.now();
  await wipeDirOptimized(dir2);
  const t4 = performance.now();
  console.log(`Optimized: ${t4 - t3}ms`);
}

runBenchmark().catch(console.error);
