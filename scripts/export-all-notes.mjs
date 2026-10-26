import fs from 'fs';
import path from 'path';

const d = JSON.parse(fs.readFileSync('C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json', 'utf-8'));
d.tasks.forEach(t => {
  const safeTitle = t.title.replace(/[\\/:*?"<>|]/g, '_');
  fs.writeFileSync(path.join('e:/Learn/notes', `${safeTitle}.md`), t.description, 'utf-8');
});
console.log('Exported all task notes successfully.');
