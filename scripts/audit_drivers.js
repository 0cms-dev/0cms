import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRIVERS_DIR = path.resolve(__dirname, '../lib/frameworks/drivers');

async function auditDrivers() {
  const files = fs.readdirSync(DRIVERS_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
  
  console.log(`🔍 Auditing ${files.length} framework drivers...\n`);
  
  let failures = 0;
  
  for (const file of files) {
    const filePath = path.join(DRIVERS_DIR, file);
    const fileUrl = pathToFileURL(filePath).href;
    
    try {
      const module = await import(fileUrl);
      const driver = module.default;
      
      const errors = [];
      
      if (!driver.name) errors.push('Missing "name"');
      if (!driver.server) {
        errors.push('Missing "server" object');
      } else {
        if (!driver.server.command) errors.push('Missing "server.command"');
        if (!driver.server.port) errors.push('Missing "server.port"');
      }
      
      if (!driver.routing) {
        errors.push('Missing "routing" object');
      } else {
        if (!driver.routing.contentPaths) errors.push('Missing "routing.contentPaths"');
      }
      
      if (errors.length > 0) {
        console.log(`❌ [${file}]`);
        errors.forEach(err => console.log(`   - ${err}`));
        failures++;
      } else {
        console.log(`✅ [${file}] - ${driver.name} (Port: ${driver.server.port})`);
      }
      
    } catch (err) {
      console.log(`💥 [${file}] - Failed to load: ${err.message}`);
      failures++;
    }
  }
  
  console.log(`\n📊 Audit Complete: ${files.length - failures} passed, ${failures} failed.`);
  
  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

auditDrivers();
