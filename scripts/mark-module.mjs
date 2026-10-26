import fs from 'fs';
import path from 'path';
import os from 'os';

const storageDir = path.join(os.homedir(), '.roadmap-skill', 'projects');

// Auto-detect project file or use the most recently modified one
const files = fs.readdirSync(storageDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No project files found in', storageDir);
  process.exit(1);
}
// Sort by mtime descending
files.sort((a, b) => {
  const statA = fs.statSync(path.join(storageDir, a));
  const statB = fs.statSync(path.join(storageDir, b));
  return statB.mtimeMs - statA.mtimeMs;
});
const projectFile = path.join(storageDir, files[0]);

const args = process.argv.slice(2);
function getArg(flag) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

const taskId = getArg('--id') || getArg('-i');
const status = getArg('--status') || getArg('-s') || 'done';

if (!taskId) {
  console.error('Usage: node mark-module.mjs --id <taskId> [--status <done|in-progress|todo>]');
  process.exit(1);
}

const raw = fs.readFileSync(projectFile, 'utf-8');
const data = JSON.parse(raw);

let targetTask = null;
for (const task of data.tasks) {
  if (task.id === taskId || task.title.includes(taskId)) {
    targetTask = task;
    break;
  }
}

if (!targetTask) {
  console.error(`Task with id or keyword "${taskId}" not found.`);
  process.exit(1);
}

const oldStatus = targetTask.status;
targetTask.status = status;
targetTask.updatedAt = new Date().toISOString();
if (status === 'done') {
  targetTask.completedAt = new Date().toISOString();
} else {
  targetTask.completedAt = null;
}

fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf-8');
console.log(`✨ Successfully updated [${targetTask.title}]: ${oldStatus} -> ${status} (in ${path.basename(projectFile)})`);
