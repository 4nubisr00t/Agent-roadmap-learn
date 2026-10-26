import fs from 'fs';
import path from 'path';

const currentProject = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const targetDataDir = 'e:/Learn/roadmap-skill-package/data';
fs.mkdirSync(targetDataDir, { recursive: true });

if (fs.existsSync(currentProject)) {
  fs.copyFileSync(currentProject, path.join(targetDataDir, 'pwn_curriculum_backup.json'));
  console.log('Backed up current Pwn curriculum to package data folder.');
}
