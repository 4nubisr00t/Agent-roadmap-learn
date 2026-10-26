import fs from 'fs';
import path from 'path';
import os from 'os';

const storageDir = path.join(os.homedir(), '.roadmap-skill', 'projects');
const files = fs.readdirSync(storageDir).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.log('No projects found.');
  process.exit(0);
}

// Default to the most recently modified file
let targetFile = files[0];
let latestTime = 0;
files.forEach(f => {
  const stat = fs.statSync(path.join(storageDir, f));
  if (stat.mtimeMs > latestTime) {
    latestTime = stat.mtimeMs;
    targetFile = f;
  }
});

const data = JSON.parse(fs.readFileSync(path.join(storageDir, targetFile), 'utf-8'));
const tasks = data.tasks || [];

const doneCount = tasks.filter(t => t.status === 'done').length;
const totalCount = tasks.length;
const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

console.log(`\n======================================================`);
console.log(`🚀 ${data.project.name} | 学习进度拓扑`);
console.log(`📊 整体补齐率: [${doneCount}/${totalCount}] (${percent}%)`);
console.log(`======================================================`);

tasks.forEach((t) => {
  const icon = t.status === 'done' ? '🟢 [已点亮]' : t.status === 'in-progress' ? '⚡ [攻克中]' : '🔒 [待补齐]';
  console.log(`${icon} ${t.title}`);
});
console.log(`======================================================\n`);
