import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/**
 * Server-side existence check for a file under /public. Lets pages
 * render a real <Image> when the file ships and a gradient fallback
 * when it doesn't, so a missing JPEG never crashes a build.
 *
 * Only call from RSC / server components — the fs read is server-only.
 */
export function fileExistsInPublic(publicPath: string): boolean {
  const rel = publicPath.replace(/^\/+/, '');
  try {
    return fs.statSync(path.join(PUBLIC_DIR, rel)).isFile();
  } catch {
    return false;
  }
}
