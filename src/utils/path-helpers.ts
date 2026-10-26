import * as os from 'os';
import * as path from 'path';

/**
 * Get the storage directory for roadmap-skill projects
 * Returns: ROADMAP_STORAGE_DIR or ~/.roadmap-skill/projects
 */
export function getStorageDir(): string {
  if (process.env.ROADMAP_STORAGE_DIR) {
    return path.resolve(process.env.ROADMAP_STORAGE_DIR);
  }
  const homeDir = os.homedir();
  return path.join(homeDir, '.roadmap-skill', 'projects');
}
