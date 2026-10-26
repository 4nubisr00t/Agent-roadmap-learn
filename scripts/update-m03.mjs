import fs from 'fs';
import path from 'path';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
const t = d.tasks.find(x => x.id === 'pwn_03_protections');

t.description = `# 🎯 模块 03：保护机制篇 | Linux 四大安全防护 (Checksec 原理)

> **核心思路**：现代二进制程序不是“裸奔”的，Linux 提供了四大防御层。知己知彼，才能百战不殆。在做任何 CTF 题或实战漏洞挖掘前，第一步永远是运行 \`checksec\` 侦察防御！

---

## 1. 侦察敌情：使用 \`checksec\`

在 Linux 终端中对目标二进制运行：
\`\`\`bash
checksec ./vuln_program
\`\`\`
典型输出如下：
\`\`\`text
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    Canary found
    NX:       NX enabled
    PIE:      PIE enabled
\`\`\`

---

## 2. 四大防御机制全景拆解

### ① NX / DEP（No-Execute / 数据执行保护）
- **原理**：将栈段（Stack）和堆段（Heap）的内存属性标记为 \`rw-\`（可读可写但**不可执行**）。
- **防御目的**：在早期时代（Shellcode 时代），黑客溢出后直接往栈里塞一段机器码，再把返回地址指到栈上直接执行。开启 NX 后，CPU 一旦试图在栈上取指令执行，立刻报段错误 (Segmentation Fault)。
- **破解之道**：**ROP（返回导向编程）** 和 **ret2libc**。既然栈不可执行，我们就“借刀杀人”——利用程序代码段和系统 libc 中原本就允许执行的代码片段来完成提权。

---

### ② Canary（金丝雀栈保护）
- **原理**：源于早期英国煤矿工人用金丝雀预警瓦斯泄露。编译器在函数被调用时，悄悄在 \`Saved RBP\` 前面插入一个 8 字节的随机数。
- **栈结构变化对比**：
\`\`\`text
低地址 (Low Address)
+---------------------------------------+  <-- RSP
|  局部变量 buf[48]                     |
+---------------------------------------+
|  Canary (8字节随机数，最低字节为 0x00)  |  <-- 守卫门神！被修改则触发崩溃
+---------------------------------------+
|  Saved RBP (8字节)                    |  <-- RBP
+---------------------------------------+
|  Return Address (8字节)               |  <-- 攻击者想改的目标
+---------------------------------------+
高地址 (High Address)
\`\`\`
- **防御机制**：函数结尾准备执行 \`ret\` 时，会先用汇编对比 Canary 值：
  \`xor rdx, QWORD PTR [fs:0x28]\`，如果发现不相等，立刻调用 \`__stack_chk_fail()\` 强制终止程序！
- **破解之道**：
  1. **泄露 Canary**：通过格式化字符串或越界读，先把这个随机数读出来，在 payload 中原样放回相应位置。
  2. **逐字节爆破（Fork 进程）**：在有守护进程 fork 子进程的服务器上逐字节猜。

---

### ③ ASLR vs PIE（地址随机化两兄弟，新手最易混淆！）

| 区别项 | ASLR (Address Space Layout Randomization) | PIE (Position Independent Executable) |
| :--- | :--- | :--- |
| **所属层级** | **Linux 操作系统内核级** | **GCC 编译器/二进制自身级** |
| **控制开关** | \`/proc/sys/kernel/randomize_va_space\` (0关, 1半开, 2全开) | \`gcc -no-pie\` 或 \`gcc -fPIE -pie\` |
| **随机化范围** | **栈 (Stack)、堆 (Heap)、动态链接库 (libc)** | **程序自身代码段 (.text)、全局变量区 (.data/.bss)** |
| **当 PIE 关闭时** | 程序自身的代码段基地址**固定**（通常为 0x400000） | 模块 02 的 ret2text 之所以能直接跳 0x401156，正是因为目标关闭了 PIE！ |
| **破解之道** | **信息泄露 (Leak)**：只要想办法泄露任意一个函数的实际运行地址，就能算出基地址！ | 同样通过 Leak 泄露任意代码段地址，算出程序基址偏移。 |

---

### ④ RELRO（Relocation Read-Only / 重定位只读）
- **作用**：保护动态链接的 **GOT 表 (Global Offset Table)**。
- **Partial RELRO**：GOT 表依然可写，可以实施经典的 **GOT 劫持（覆写函数指针）**。
- **Full RELRO**：程序加载完成后 GOT 表变为完全只读，防御 GOT 覆写。

---

## 🎯 模块 03 通关挑战题

点开讲义仔细阅读后，请回答下面两个核心问题：
1. **在刚才的模块 02 (ret2text 实战) 中，为什么我们能直接把返回地址填成写死的 \`0x401156\`？这是因为程序关闭了哪两项保护机制？**
2. **在 64 位 Linux 下，为什么 Canary 的最低字节（低位第 1 个字节）总是设计为 \`0x00\`（NULL 字节）？**（提示：思考 C 语言中 \`printf("%s", buf)\` 或 \`puts(buf)\` 是怎么判断字符串结束的？）
`;

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log('Updated module 03 description successfully.');
