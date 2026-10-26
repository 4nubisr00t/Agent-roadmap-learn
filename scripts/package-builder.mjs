import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const srcDir = 'e:/Learn/roadmap-skill';
const targetDir = 'e:/Learn/roadmap-skill-package';

console.log('Creating target directory:', targetDir);
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// List of folders and files to copy
const includeItems = [
  'src',
  'dist',
  'scripts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsup.config.ts',
  'vite.config.ts',
  'start-web.mjs'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const item of includeItems) {
  const s = path.join(srcDir, item);
  const d = path.join(targetDir, item);
  if (fs.existsSync(s)) {
    console.log(`Copying ${item}...`);
    copyRecursive(s, d);
  } else {
    console.warn(`Item not found: ${s}`);
  }
}

// Create start.bat
const startBat = `@echo off
chcp 65001 >nul
echo ========================================================
echo   🚀 启动可视化学习工作台 (Web Server)
echo ========================================================
echo.
echo 正在检查并启动后台服务...
start /b node start-web.mjs
timeout /t 2 >nul
echo 正在打开浏览器访问 http://localhost:3000 ...
start http://localhost:3000
echo.
echo 服务已成功启动！请在浏览器中使用。
echo 如需关闭服务，请运行 stop.bat 或关闭此窗口。
pause
`;
fs.writeFileSync(path.join(targetDir, 'start.bat'), startBat, 'utf-8');

// Create stop.bat
const stopBat = `@echo off
chcp 65001 >nul
echo ========================================================
echo   🛑 停止可视化学习工作台服务
echo ========================================================
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo 正在终止进程 PID: %%a ...
    taskkill /F /PID %%a >nul 2>&1
)
echo 服务已彻底停止，端口 3000 已释放。
timeout /t 2 >nul
`;
fs.writeFileSync(path.join(targetDir, 'stop.bat'), stopBat, 'utf-8');

console.log('Copied base files and generated launchers successfully.');
