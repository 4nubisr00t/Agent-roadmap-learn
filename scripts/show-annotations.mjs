import fs from 'fs';
import path from 'path';

const file = 'e:/Learn/notes/user_annotations.json';
if (!fs.existsSync(file)) {
  console.log('No annotations found yet.');
  process.exit(0);
}

const list = JSON.parse(fs.readFileSync(file, 'utf-8'));
console.log(`\n======================================================`);
console.log(`📝 当前学习批注与疑问总数: ${list.length}`);
console.log(`======================================================`);

list.forEach((item, i) => {
  console.log(`\n[${i + 1}] 模块: ${item.taskTitle}`);
  console.log(`    划选原文: "${item.selectedText}"`);
  console.log(`    疑问/批注: ${item.comment}`);
  console.log(`    时间: ${item.createdAt}`);
});
console.log(`\n======================================================\n`);
