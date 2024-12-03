import * as fs from 'fs';
import * as path from 'path';

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDownloadPath(type: 'single' | 'album', fileName: string, albumName?: string): string {
  const baseDir = path.join(process.cwd(), 'downloads');
  ensureDir(baseDir);

  if (type === 'album' && albumName) {
    const albumDir = path.join(baseDir, albumName);
    ensureDir(albumDir);
    return path.join(albumDir, fileName);
  }

  return path.join(baseDir, fileName);
}
