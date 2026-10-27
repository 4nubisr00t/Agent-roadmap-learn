# 🤖 Agent 指南：可视化学习与技能树工作台 (AI Agent Operation Manual)

> **适用对象**：配合人类用户（如学生、长辈、编程初学者等）进行**可视化学习与交互答疑**的任何 AI Coding / Assistant Agent（包括 Google Antigravity, Claude Code, Cursor, ChatGPT 等）。  
> **核心定位**：人类用户在 Web 浏览器前端通过**技能拓扑树、卡片讲义、划词批注、一键导出**进行沉浸式学习；你（AI Agent）作为后台的全能导师与架构师，负责管理服务、规划课程、注入深度讲义、监听划词提问、以及实时点亮学习进度。

---

## 目录
1. [系统总体架构与运作机理](#一-系统总体架构与运作机理)
2. [环境准备与服务生命周期管理](#二-环境准备与服务生命周期管理)
3. [数据存储与核心契约规范 (Data Schema)](#三-数据存储与核心契约规范-data-schema)
4. [Agent 标准工作流程 (Standard Workflows)](#四-agent-标准工作流程-standard-workflows)
   - [流程 1：开辟一门全新课程/技能树](#流程-1开辟一门全新课程技能树)
   - [流程 2：撰写最高规格的讲义内容](#流程-2撰写最高规格的讲义内容)
   - [流程 3：监听并解答用户的「划词批注」](#流程-3监听并解答用户的划词批注)
   - [流程 4：考核通关与「实时点亮」绿色节点](#流程-4考核通关与实时点亮绿色节点)
   - [流程 5：导出本地 Markdown 笔记](#流程-5导出本地-markdown-笔记)
5. [内置脚本工具库速查](#五-内置脚本工具库速查)
6. [Agent 避坑指南与最佳实践](#六-agent-避坑指南与最佳实践)

---

## 一、 系统总体架构与运作机理

本系统是一个 **“用户图形交互 + Agent 底层驱动”** 的人机协同学习工作台：

```text
+--------------------------------------------------------------------------+
|                        用户前端 Web UI (浏览器 http://localhost:3000)     |
|  - 🌟 ReactFlow 技能拓扑树：直观看到哪些模块已点亮(绿)、正在学(蓝)、未解锁(灰)    |
|  - 📖 沉浸式讲义阅读器：点击卡片弹出全屏讲义（Markdown 渲染、图解、代码块）       |
|  - 💬 划词批注与提问系统：用鼠标划选不懂的句子，弹出气泡打上疑问，自动持久化        |
|  - 📥 导出笔记按钮：点击一键下载当前模块的纯 Markdown 笔记文件到本地电脑          |
+--------------------------------------------------------------------------+
                                     ▲
                     HTTP / REST API │ 静态托管
                                     ▼
+--------------------------------------------------------------------------+
|                       后端 Express Server (start-web.mjs)                |
|  - 托管 Web 前端静态资源 (dist/web/app/)                                  |
|  - REST APIs: /api/projects, /api/tasks, /api/dependency-views           |
|  - 批注同步 API: GET/POST/DELETE /api/annotations                        |
+--------------------------------------------------------------------------+
                                     ▲
                     文件监听与持久化 │ 命令行脚本
                                     ▼
+--------------------------------------------------------------------------+
|                             后台持久化数据层                              |
|  1. 项目拓扑数据库：~/.roadmap-skill/projects/<projectId>.json            |
|     (支持环境变量 ROADMAP_STORAGE_DIR 自定义路径)                         |
|  2. 批注与提问库：notes/user_annotations.json 与 notes/我的学习批注与疑问.md|
|  3. 导出的课程笔记：notes/*.md                                            |
+--------------------------------------------------------------------------+
                                     ▲
                         读取 / 写入 / 驱动教学
                                     ▼
+--------------------------------------------------------------------------+
|                    🤖 负责伴学与教学的 AI Agent (你)                      |
|  - 规划/更新技能树拓扑；                                                  |
|  - 注入深度教学内容（讲义、图解、靶场代码）；                              |
|  - 读取用户划词批注，针对性逐条答疑解惑；                                  |
|  - 验证用户答题，调用脚本点亮技能树节点！                                  |
+--------------------------------------------------------------------------+
```

---

## 二、 环境准备与服务生命周期管理

### 1. 运行依赖
- **Node.js**: >= 18.0.0
- **npm**: 系统自带标准 npm

### 2. 启动服务（Agent 请作为守护进程/后台进程启动）
```bash
# 进入工程目录
cd /path/to/roadmap-skill-package

# 首次使用安装依赖（若已打包自带 node_modules 可跳过）
npm install

# 启动 Web 服务 (默认监听端口 3000)
node start-web.mjs
```
> **Agent 提示**：在多任务执行工具中，使用 `run_command` 并设置 `IsDaemon: true`（或后台任务），让服务持续在后台运行。

### 3. 健康检查
```bash
# 验证服务是否成功启动
curl -I http://localhost:3000
# 返回 HTTP/1.1 200 OK 即为正常运行
```

### 4. 停止服务
- Windows: 运行 `stop.bat`，或在命令行中查询释放端口：
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```
- Linux/macOS:
  ```bash
  kill $(lsof -t -i:3000)
  ```

---

## 三、 数据存储与核心契约规范 (Data Schema)

所有课程与技能拓扑保存在 `~/.roadmap-skill/projects/<projectId>.json`（如果设置了环境变量 `ROADMAP_STORAGE_DIR` 则保存在该指定目录）。

### 完整的 Project JSON 结构契约：
```json
{
  "version": 1,
  "project": {
    "id": "proj_1792501168121_wfulv9v",
    "name": "🎯 Pwn 二进制漏洞利用全景技能树",
    "description": "专为初学者打造的从汇编底层到实战攻坚全景学习图谱",
    "projectType": "skill-tree",
    "createdAt": "2026-10-20T13:00:00.000Z",
    "updatedAt": "2026-10-21T08:00:00.000Z"
  },
  "tasks": [
    {
      "id": "node_01_basics",
      "projectId": "proj_1792501168121_wfulv9v",
      "title": "节点 0.1：核心第一课",
      "description": "# Markdown 格式的完整讲义内容（支持图解、代码、表格、思考题）",
      "status": "done",         // 三种核心状态：todo (待解锁) | in-progress (攻坚中) | done (已点亮)
      "priority": "high",       // critical | high | medium | low
      "tags": ["core", "basics"],
      "completedAt": "2026-10-20T14:00:00.000Z",
      "createdAt": "2026-10-20T13:00:00.000Z",
      "updatedAt": "2026-10-20T14:00:00.000Z"
    }
  ],
  "dependencyViews": [
    {
      "id": "view_skilltree",
      "projectId": "proj_1792501168121_wfulv9v",
      "name": "🌟 核心技能拓扑树",
      "nodes": [
        {
          "taskId": "node_01_basics",
          "x": 80,              // ReactFlow 画布水平物理坐标
          "y": 180,             // ReactFlow 画布垂直物理坐标
          "collapsed": false,
          "note": "【已点亮】内功基石"
        }
      ],
      "edges": [
        {
          "id": "edge_1_2",
          "fromTaskId": "node_01_basics",
          "toTaskId": "node_02_advance",
          "kind": "hard",       // hard 强依赖连线 | soft 弱依赖
          "createdAt": "2026-10-20T13:00:00.000Z"
        }
      ]
    }
  ]
}
```

---

## 四、 Agent 标准工作流程 (Standard Workflows)

### 流程 1：开辟一门全新课程/技能树
无论用户想学什么（例如：*Python 自动化、日常生活安全常识、烘焙西点、英语音标、考证备考*）：
1. **拓扑规划**：Agent 先设计一个从浅入深的 5~15 个递进节点，并规划各节点之间的依赖连线（DAG）。
2. **坐标排布推荐**：
   - 第 0 阶段（入门基石）：`x: 60, y: 150` 与 `x: 60, y: 350`
   - 第 1 阶段（初级进阶）：`x: 340, y: 150` 与 `x: 340, y: 350`
   - 第 2 阶段（中级实战）：`x: 620, y: 150` 与 `x: 620, y: 350`
   - 后续依次 `x + 280` 向右平移展开。
3. **初始状态设置**：
   - 起始节点设为 `in-progress`（⚡ 攻克中），其余设为 `todo`（🔒 待解锁）。

---

### 流程 2：撰写最高规格的讲义内容（杜绝走马观花）
当你在任务的 `description` 字段写入讲义时，**严禁写成只有几条无聊要点的空洞摘要**！
必须严格遵循以下 **8 大黄金教学结构**：

1. **场景矛盾与第一性原理**：
   - 不背书，讲透生活化比喻与场景冲突（例如：“为什么要这个设计？如果没有它，系统会发生什么灾难？”）。
2. **最小可运行源码 / 实例**：
   - 给出干净、无多余依赖的完整代码，包含清晰的运行或编译命令。
3. **物理拓扑与测算表格**：
   - 用 Markdown 表格或 ASCII 字符画详细测算空间、尺寸、偏移量、流程图。
4. **硬件/逻辑微操作慢动作拆解**：
   - 像慢动作逐帧特写一样，追踪每一步指令执行后内部状态（指针、变量、寄存器）的具体变化。
5. **交互时序与攻击/操作流程图**：
   - 清楚画出输入与输出的配对时序。
6. **工业级完整落地脚本 / 代码**：
   - 包含详细注释，用户或脚本可以直接复制运行。
7. **知识树全景画布与进度看板**：
   - 底部固定输出状态表，明确标注 `[v]` 已点亮、`[>]` 攻坚中、`[ ]` 待推进，以及「当前锚点」与「下一推进方向」。
8. **实验验证清单与通关思考题**：
   - 留下 1~2 道需要调动底层原理思考的问题，引导用户在卡片上划词批注或在对话中回答。

---

### 流程 3：监听并解答用户的「划词批注」
用户在浏览器里阅读讲义时，随时会用鼠标划选某句话，点击 **`[💬 划词批注 / 提问]`** 并提交疑问。
系统会自动将批注存盘至：
- `notes/user_annotations.json`
- `notes/我的学习批注与疑问.md`

#### Agent 交互触发点：
当用户在对话中提到：
> *“看我批注”*、*“解答一下我打的批注”*、*“我有几个不懂的地方”*

#### Agent 处理定式：
1. **立即读取批注库**：运行 `node scripts/show-annotations.mjs` 或直接读取 `notes/user_annotations.json`。
2. **定位疑问原文**：看清用户划选的 `selectedText` 原文句子，以及用户的 `comment` 具体困惑。
3. **深度攻坚答疑**：
   - 引用用户划选的句子；
   - 用通俗的语言剖析底层机制；
   - 结合前后的知识点打消用户的困惑；
   - 确认用户彻底理解后，提示其可以点击卡片上的「删除」按钮归档批注，或由 Agent 标记已解决。

---

### 流程 4：考核通关与「实时点亮」绿色节点
当用户答对了当前攻坚节点的思考题，或完成了实操验证：
1. **执行点亮脚本**：
   ```bash
   node scripts/mark-module.mjs --id <当前节点ID> --status done
   node scripts/mark-module.mjs --id <下一节点ID> --status in-progress
   ```
2. **前端自动变化**：
   - 拓扑树上的旧卡片立即变成**亮绿色（Done）**！
   - 新卡片自动变成**蓝色激活态（In Progress）**！
   - 用户在浏览器按 F5 或切换标签页即可实时看到自己的学习成果被点亮！
3. **鼓励并无缝承接**：赞许用户的回答，简要复盘题目的核心细节，并引导用户点开下一个刚解锁的节点。

---

### 流程 5：导出本地 Markdown 笔记
为了给用户保留永久的知识资产：
- 用户可以点击前端右上角 **`[📥 导出笔记 (.md)]`** 下载到本地。
- Agent 也可以随时执行：
  ```bash
  node scripts/export-all-notes.mjs
  ```
  这会将所有讲义自动以人类可读的标题格式化导出到 `notes/*.md`。

---

### 流程 6：AI 导师配置与多大模型供应商直连
系统内嵌了多厂商大模型直连与流式伴学（SSE Stream）机制：
- **前端入口**：顶部导航栏 **`[🤖 AI 配置]`** 按钮，或在卡片内的 **「AI 导师伴学」** 标签页中点击切换。
- **预设厂商 Base URL 矩阵**：
  - **🚀 DeepSeek (深度求索)**: `https://api.deepseek.com/v1` (默认 `deepseek-chat`)
  - **🌐 OpenAI (ChatGPT)**: `https://api.openai.com/v1` (默认 `gpt-4o`)
  - **💎 Google Gemini**: `https://generativelanguage.googleapis.com/v1beta/openai/` (默认 `gemini-2.0-flash`)
  - **⚡ SiliconFlow (硅基流动)**: `https://api.siliconflow.cn/v1` (默认 `deepseek-ai/DeepSeek-V3`)
  - **🌙 Moonshot AI (Kimi)**: `https://api.moonshot.cn/v1` (默认 `moonshot-v1-8k`)
  - **🧠 Zhipu AI (智谱 GLM)**: `https://open.bigmodel.cn/api/paas/v4` (默认 `glm-4-flash`)
  - **🔀 OpenRouter**: `https://openrouter.ai/api/v1` (默认 `deepseek/deepseek-chat`)
  - **🦙 Ollama (本地离线)**: `http://localhost:11434/v1` (无需 Key，私有化)
  - **🛠️ 自定义中转**: 任意兼容 OpenAI 接口规范的代理地址
- **伴学对话特点**：
  - 自动向 AI 模型注入当前攻坚节点大纲、代码段及用户划词批注；
  - 采用打字机式流式推送（SSE）；
  - 对话记录自动按任务持久化于浏览器 `localStorage`。

---

## 五、 内置脚本工具库速查

在 `scripts/` 目录下提供了专供 Agent 调用的高效率命令行工具：

| 脚本文件名 | 用途与调用示例 | 说明 |
| :--- | :--- | :--- |
| **`show-progress.mjs`** | `node scripts/show-progress.mjs` | 控制台极速打印全图补齐率、各节点点亮状态表 |
| **`mark-module.mjs`** | `node scripts/mark-module.mjs --id <taskId> --status <done\|in-progress\|todo>` | 一键翻转指定节点状态，更新拓扑数据库 |
| **`show-annotations.mjs`** | `node scripts/show-annotations.mjs` | 查看当前用户划词批注总数、划选原文与提问内容 |
| **`export-all-notes.mjs`** | `node scripts/export-all-notes.mjs` | 批量将全课程所有节点讲义同步导出为 Markdown 文件 |

---

## 六、 Agent 避坑指南与最佳实践

1. **绝对禁止贪多赶进度**：
   - 一次只攻坚一个节点。宁可把一个节点讲得入木三分，绝不敷衍更新 10 个骨架。
2. **保护用户原汁原味的代码与环境**：
   - 项目编译好的 `dist/` 资源已内置，无需每次重新 `npm run build`，修改 `server.ts` 或前端组件时才需重编。
3. **端口冲突自愈**：
   - 若 `node start-web.mjs` 报 `EADDRINUSE: address already in use :::3000`，先使用 PowerShell 释放 3000 端口，再重新拉起。
4. **鼓励划词提问**：
   - 随时提醒用户：“你在读卡片时，有任何卡壳的地方直接用鼠标划选打批注，我会在后台全程守候答疑！”
