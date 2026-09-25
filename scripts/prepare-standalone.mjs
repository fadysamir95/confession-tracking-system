import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const nextDir = join(root, ".next");
const standaloneDir = join(nextDir, "standalone");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standaloneDir))) {
  throw new Error("Next.js standalone output was not generated.");
}

// Next may copy dotenv files into standalone output when the build environment has them. Secrets
// must be supplied at runtime, so remove every copied environment file before packaging. The scan
// is recursive because a nested copy (for example under node_modules) would still ship a secret.
async function removeDotenvFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeDotenvFiles(full);
    } else if (entry.name.startsWith(".env")) {
      await rm(full, { force: true });
      process.stdout.write(`Removed ${full}\n`);
    }
  }
}

await removeDotenvFiles(standaloneDir);

const staticSource = join(nextDir, "static");
if (await exists(staticSource)) {
  const staticTarget = join(standaloneDir, ".next", "static");
  await mkdir(join(standaloneDir, ".next"), { recursive: true });
  await rm(staticTarget, { recursive: true, force: true });
  await cp(staticSource, staticTarget, { recursive: true });
}

const publicSource = join(root, "public");
if (await exists(publicSource)) {
  await rm(join(standaloneDir, "public"), { recursive: true, force: true });
  await cp(publicSource, join(standaloneDir, "public"), { recursive: true });
}

process.stdout.write("Standalone output prepared without dotenv files; static assets copied.\n");
