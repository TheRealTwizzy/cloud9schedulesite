// Runs at container startup when DATA_DIR points to a persistent volume.
// Copies the bundled seed files from ./data into DATA_DIR only if they don't
// already exist there, so existing live data (passwords, requests, etc.) is
// never overwritten on redeploy.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const src = join(process.cwd(), "data");
const dest = process.env.DATA_DIR;

if (!dest || dest === src) {
  // No custom DATA_DIR — running locally, nothing to do.
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

for (const file of readdirSync(src)) {
  const destFile = join(dest, file);
  if (!existsSync(destFile)) {
    copyFileSync(join(src, file), destFile);
    console.log(`seeded ${file} → ${dest}`);
  }
}
