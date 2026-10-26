import fs from 'fs';
import path from 'path';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));

// Retain existing task 1, 2, 3
const task01 = d.tasks.find(x => x.id === 'pwn_01_stack_frame');
const task02 = d.tasks.find(x => x.id === 'pwn_02_ret2text');
const task03 = d.tasks.find(x => x.id === 'pwn_03_protections');

const now = new Date().toISOString();

const newTasks = [
  task01,
  task02,
  task03,
  {
    id: 'pwn_04_canary_bypass',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 04：金丝雀破解 | Canary 格式化/越界泄露与 Fork 逐字节爆破',
    description: `# 🎯 模块 04：金丝雀破解 | Canary 格式化/越界泄露与 Fork 逐字节爆破

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> Canary Bypass

---

## 1. Canary（金丝雀）的核心防护机理

Canary 是现代二进制防栈溢出的守门大将。它在函数初始化时插入栈底，在函数返回前用汇编比较：
\`\`\`asm
mov    rax, QWORD PTR fs:0x28    # 从 TLS 线程局部存储读取随机金丝雀
mov    QWORD PTR [rbp-0x8], rax  # 存放在 [rbp-0x8] 处
...
mov    rax, QWORD PTR [rbp-0x8]  # 函数返回前取回
xor    rax, QWORD PTR fs:0x28    # 异或对比
jne    1190 <__stack_chk_fail@plt> # 若不为0，说明被篡改，直接触发崩溃！
\`\`\`

---

## 2. 经典绕过姿势全解析

### 姿势 ①：泄露 Canary（Leak Canary）
- **原理**：Canary 存放在栈上。如果程序存在格式化字符串漏洞（如 \`printf(buf)\`）或输出未截断漏洞（如 \`puts(buf)\`），我们可以通过精确读取栈内存将 Canary 打印出来！
- **细节注意**：Canary 的最低字节固定是 \`0x00\`（防止 \`puts\`/\`printf("%s")\` 顺带将其打印）。在输出未截断漏洞中，我们可以恰好覆盖这 1 个 \`0x00\`，让 \`puts\` 一直打印直到 Canary 结束，从而泄露出 Canary 的高 7 个字节！构造 Payload 时，再把末尾补回 \`0x00\` 即可。

### 姿势 ②：Fork 守护进程逐字节爆破（Brute-force Canary）
- **原理**：在网络服务或多进程服务端中，主进程使用 \`fork()\` 创建子进程处理连接。**fork() 会完全复制父进程的内存空间，其 Canary 值绝对保持不变！**
- **攻击流程**：
  从第 1 个未知字节开始，逐字节尝试 \`0x00\` 到 \`0xFF\`（256种可能）。
  - 若子进程崩溃提示 \`*** stack smashing detected ***\`，说明猜错了；
  - 若子进程正常退出或继续执行，说明猜对了！
  在 64 位下只需要爆破 7 个字节（\(7 \\times 256 = 1792\) 次尝试），在脚本里几十秒即可轻松拿到 Canary！

---

## 🎯 模块 04 通关挑战
1. 为什么 \`fork()\` 创建的子进程其 Canary 与父进程完全相同，而如果程序是重新 \`execve()\` 启动 Canary 就会发生改变？
2. 如果我们成功泄露了 Canary 为 \`0x1122334455667700\`，在 64 位程序中，覆写栈时的 payload 结构应该是怎么排列的？`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'stack', 'canary'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_05_ret2libc',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 05：突破 NX 保护 | ret2libc 与 GOT/PLT 延迟绑定泄露基址',
    description: `# 🎯 模块 05：突破 NX 保护 | ret2libc 与 GOT/PLT 延迟绑定泄露基址

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> ROP -> ret2libc

---

## 1. 为什么需要 ret2libc？

当程序开启了 **NX（不可执行）**，并且程序内部**没有后门函数**（没有 \`system("/bin/sh")\`）时：
我们必须借用 Linux 标配的系统动态链接库 —— **libc.so**！
libc 库中包含成千上万个系统函数（包括 \`system\`、\`execve\`、\`open\`、\`read\`、\`write\`）以及字符串 \`"/bin/sh"\`！

---

## 2. 动态链接核心：PLT 与 GOT 表的秘密

- **PLT 表（Procedure Linkage Table，过程链接表）**：位于代码段，可执行。每次调用函数时（如 \`call puts@plt\`），实际上跳到 PLT 表。
- **GOT 表（Global Offset Table，全局偏移表）**：位于数据段，存放函数在内存中的**真实绝对地址**。
- **延迟绑定（Lazy Binding）**：第一次调用函数时，由动态链接器解析函数真实地址填入 GOT 表；之后再次调用直接从 GOT 表获取。

---

## 3. 两步决胜法（ret2libc 经典套路）

### 第一步：泄露某个已解析函数的 GOT 真实地址
构造第一条 ROP 链：
\`\`\`python
# 利用 puts(puts@got) 将 puts 在内存中的真实加载地址打印出来
payload1 = b'A' * offset
payload1 += p64(pop_rdi_ret)
payload1 += p64(puts_got)
payload1 += p64(puts_plt)
payload1 += p64(main_addr) # 重新回到 main 函数，以便进行第二次输入！
\`\`\`

### 第二步：计算 libc 基地址，获取 system 真实地址
\`\`\`python
# 核心公式：函数运行时真实地址 - 该函数在 libc 文件中的静态偏移 = libc 运行时基地址！
libc_base = puts_real_addr - libc.symbols['puts']
system_real_addr = libc_base + libc.symbols['system']
binsh_real_addr = libc_base + next(libc.search(b'/bin/sh'))

# 构造第二条 ROP 链拿下 Shell！
payload2 = b'A' * offset
payload2 += p64(pop_rdi_ret)
payload2 += p64(binsh_real_addr)
payload2 += p64(system_real_addr)
\`\`\`

---

## 🎯 模块 05 通关挑战
1. 为什么 libc 的基地址每次运行都在随机变动（ASLR），但 \`puts\` 函数与 \`system\` 函数之间的“相对差值（偏移）”却恒定不变？
2. 在 64 位 Ubuntu 18.04+ 系统中，直接跳 \`system\` 为什么有时会因为 \`movaps\` 16 字节栈对齐要求崩溃？如何用一个纯 \`ret\` 指令解决它？`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'ret2libc'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_06_ret2csu',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 06：通用万能 Gadget | __libc_csu_init 控制 rdi/rsi/rdx 寄存器传参 (ret2csu)',
    description: `# 🎯 模块 06：通用万能 Gadget | __libc_csu_init 控制 rdi/rsi/rdx 寄存器传参 (ret2csu)

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> ROP -> ret2csu

---

## 1. 痛点：找不到控制 rdx 的 Gadget 怎么办？

在 64 位程序中，调用像 \`write(1, buf, size)\` 这样的三参数函数需要依次控制：
- \`rdi\` (第1参数: 1)
- \`rsi\` (第2参数: buf)
- \`rdx\` (第3参数: size)
在许多精简的程序中，\`pop rdi; ret\` 和 \`pop rsi; ret\` 容易找，但 **\`pop rdx; ret\` 却极其罕见**！

---

## 2. 秘密武器：\`__libc_csu_init\` 预编译代码段

每一个由 GCC 编译的 64 位 ELF 程序，默认都会编译进一段初始化代码：\`__libc_csu_init\`。
在这段代码的末尾，存在两段精妙绝伦的汇编片段：

\`\`\`asm
# Gadget 1 (从栈上连续弹出 6 个寄存器)
pop rbx
pop rbp
pop r12
pop r13
pop r14
pop r15
ret

# Gadget 2 (将 r12~r15 的值分别传递给 rdi, rsi, rdx 并通过 [r12+rbx*8] 间接调用函数！)
mov rdx, r13
mov rsi, r14
mov edi, r15d
call QWORD PTR [r12+rbx*8]
\`\`\`

---

## 3. 巧妙构造利用流程

1. 先跳到 **Gadget 1**，把想要传给 \`rdx\`、\`rsi\`、\`rdi\` 的数值以及目标函数指针依次塞进栈里；
2. 再跳到 **Gadget 2**，CPU 会自动完成参数赋值，并将控制权交给我们指定的函数！`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'ret2csu'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_07_stack_pivot',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 07：空间受限必杀技 | 栈迁移 (Stack Pivoting / leave;ret 伪造栈帧)',
    description: `# 🎯 模块 07：空间受限必杀技 | 栈迁移 (Stack Pivoting / leave;ret 伪造栈帧)

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> Fancy ROP -> Stack Pivoting (栈迁移)

---

## 1. 致命困境：栈溢出字节数太短！

假如有这样一段极常见的现实漏洞代码：
\`\`\`c
char buf[40];
read(0, buf, 0x38); // 缓冲区只有 40 字节，但只能读入 56 字节 (0x38)
\`\`\`
计算一下偏移：
- \`buf\` 占 40 字节
- \`Saved RBP\` 占 8 字节
- 剩下的溢出空间正好只有 **8 字节**（只够覆盖一个返回地址 Return Address！）
一条完整的 ret2libc ROP 链至少需要几十上百个字节，**8 个字节根本塞不下 ROP 链，怎么办？**

**答案：栈迁移（Stack Pivoting）—— 把栈“搬家”到一块我们能完全控制的巨大内存区域（如 BSS 段或堆区）！**

---

## 2. 核心原理：彻底解剖 \`leave; ret\` 指令对

函数结尾准备退出时，汇编通常是：
\`\`\`asm
leave
ret
\`\`\`
这两条指令拆解开来是极简却致命的：
- **\`leave\`** 等价于：
  \`mov rsp, rbp\`  (将 RBP 赋给 RSP，撤销局部变量空间)
  \`pop rbp\`       (从栈顶弹出旧 RBP，恢复父栈帧底)
- **\`ret\`** 等价于：
  \`pop rip\`       (从栈顶弹出返回地址，改变程序执行流)

---

## 3. 栈迁移双连击魔术（两步迁移图解）

\`\`\`text
初始栈状态 (Stack Overflow):
+------------------------------------+
|  buf (我们在这里提前写好 ROP 链)    |  <-- 假设首地址为 bss_addr 或 buf_addr
+------------------------------------+
|  Saved RBP 篡改为 fake_stack_addr  |  <-- 想要迁移到的目标地址 - 8 (例如 bss_addr)
+------------------------------------+
|  Return Address 篡改为 leave; ret  |  <-- 指向程序自带的 leave; ret 指令地址！
+------------------------------------+
\`\`\`

**CPU 执行轨迹**：
1. 原函数正常结尾，执行第 1 次 \`leave\`：
   - \`pop rbp\` 把我们伪造的 \`fake_stack_addr\` 弹入了 **RBP** 寄存器！
2. 原函数执行第 1 次 \`ret\`：
   - 从栈顶取出返回地址，跳向了我们指定的 **\`leave; ret\` gadget**！
3. **关键时刻爆发**：进入 gadget 执行第 2 次 \`leave\`：
   - **\`mov rsp, rbp\`**：此时 RBP 已经被我们改成了 \`fake_stack_addr\`！
   - **RSP 寄存器瞬间被修改为 \`fake_stack_addr\`！栈顶成功迁移！**
   - \`pop rbp\` 弹出一个垃圾值；
4. gadget 执行第 2 次 \`ret\`：
   - **CPU 直接从新栈（BSS 段/伪造栈区）弹出我们精心布置的长 ROP 链执行！**

---

## 🎯 模块 07 通关挑战
1. 为什么在伪造栈底时，通常要将 \`fake_rbp\` 设置为 \`target_bss_addr - 8\`（或有 8 字节偏移），而不是正好等于 \`target_bss_addr\`？
2. 除了利用 \`leave; ret\` 实现栈迁移外，在程序里如果找到 \`pop rsp; ret\` 或 \`xchg rax, rsp; ret\`，它们又是如何实现栈迁移的？`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'stack-pivot', 'leave-ret'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_08_srop',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 08：信号机制劫持 | SROP (Sigreturn Oriented Programming 系统调用伪造上下文)',
    description: `# 🎯 模块 08：信号机制劫持 | SROP (Sigreturn Oriented Programming 系统调用伪造上下文)

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> Advanced ROP -> SROP

---

## 1. 什么是 SROP？

在 Linux 系统中，当进程收到信号（如 SIGINT、SIGSEGV）时，内核会暂停进程，并将**当前所有的寄存器状态（rax, rbx, rcx, rdx, rsi, rdi, rsp, rip...）一次性保存在栈上的一个结构体中（\`ucontext_t\`）**。
当信号处理完成后，进程调用系统调用 \`sigreturn\`（64位系统调用号为 15，\`0xf\`），内核会把栈上的这块结构体**无条件原样恢复到所有物理寄存器**！

---

## 2. 黑客的利用点

如果我们能伪造栈上的这块 \`ucontext_t\` 结构体（被称为 \`sigcontext\`），然后触发系统调用 \`sigreturn\`，**我们就能仅通过一次系统调用，同时随心所欲地控制 CPU 的所有寄存器（包括 RIP、RSP、RDI、RSI、RDX）！**

在 pwntools 中，官方直接内置了神器：
\`\`\`python
frame = SigreturnFrame()
frame.rax = constants.SYS_execve
frame.rdi = binsh_addr
frame.rsi = 0
frame.rdx = 0
frame.rip = syscall_addr
payload = b'A' * offset + p64(sigreturn_syscall) + bytes(frame)
\`\`\``,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'srop'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_09_ret2dlresolve',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 09：无泄露终极武器 | ret2dlresolve 伪造动态链接重定位表',
    description: `# 🎯 模块 09：无泄露终极武器 | ret2dlresolve 伪造动态链接重定位表

> **CTF Wiki 对应章节**：Linux Pwn -> Stack Overflow -> Advanced ROP -> ret2_dl_runtime_resolve

---

## 1. 极致限制下的奇迹

如果程序：
- 开启了 NX
- 关闭了 PIE
- **没有任何可供泄露 libc 地址的输出函数**（没有 \`puts\`、没有 \`printf\`、没有 \`write\`）
此时传统的 ret2libc 完全失效！黑客如何执行 \`system("/bin/sh")\`？

---

## 2. 利用 \`_dl_runtime_resolve\` 动态符号解析

当程序第一次调用未解析的动态函数时，PLT 表会调用内部函数 \`_dl_runtime_resolve(link_map, reloc_arg)\`。
该函数会根据 \`reloc_arg\` 偏移去 \`.rel.plt\`、\`.dynsym\`、\`.dynstr\` 表中查询函数字符串名字（如 \`"read"\`），并把解析后的真实地址填回 GOT 表。

**攻击思路**：
我们在可写的内存（如 BSS 段）伪造一个假的 \`Elf32_Rel / Elf64_Rela\` 结构体和一个假的符号名字字符串 \`"system"\`，然后让 \`_dl_runtime_resolve\` 帮我们解析出 \`system\` 函数并直接执行！`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'ret2dlresolve'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_10_integer_overflow',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 10：边界与类型陷阱 | 整数溢出 (Integer Overflow) 与符号混淆',
    description: `# 🎯 模块 10：边界与类型陷阱 | 整数溢出 (Integer Overflow) 与符号混淆

> **CTF Wiki 对应章节**：Linux Pwn -> Integer Overflow

---

## 1. 计算机中的整数限制

在 C 语言中，整型变量是有物理存储边界的：
- \`unsigned char\`：0 ~ 255
- \`short\`：-32768 ~ 32767
- \`int\` (32位)：-2,147,483,648 ~ 2,147,483,647

---

## 2. 常见漏洞类型

### ① 向上溢出（Overflow）与向下溢出（Underflow）
\`\`\`c
unsigned short len = 65535;
len = len + 1; // len 变为 0！
\`\`\`

### ② 符号混淆（Signedness Bug）
\`\`\`c
int length;
scanf("%d", &length);
if (length > 100) { // 检查了上限
    exit(0);
}
// 但若用户输入 -1，可以通过 if 检查！
// 在接下来的 read 函数中，第三个参数是 size_t（无符号数）
read(0, buf, length); // -1 被解释为 0xFFFFFFFF (4GB)，引发超级栈溢出！
\`\`\``,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'integer-overflow'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_11_format_string',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 11：任意读写神器 | 格式化字符串漏洞与 GOT 表劫持 (%p/%s/%n)',
    description: `# 🎯 模块 11：任意读写神器 | 格式化字符串漏洞与 GOT 表劫持 (%p/%s/%n)

> **CTF Wiki 对应章节**：Linux Pwn -> Format String

---

## 1. 漏洞成因：危险的写法

\`\`\`c
char buf[100];
read(0, buf, 100);
printf(buf); // 致命错误！应为 printf("%s", buf);
\`\`\`

---

## 2. 核心功能点

### ① 确定偏移（Parameter Position）
输入 \`AAAA-%p-%p-%p-%p-%p-%p-%p-%p\`，观察输出中第几个 \`%p\` 打印出 \`0x41414141\`（AAAA）。
若在第 6 个出现，说明参数偏移为 6，后续可通过 \`%6$p\` 直接指定该参数！

### ② 任意地址读（Arbitrary Read）
将目标地址（如 GOT 表地址）放在栈上，配合 \`%6$s\` 即可将该地址指向的字符串打印出来，直接泄露 libc！

### ③ 任意地址写（Arbitrary Write - %n 魔术）
\`%n\` 的作用是：**将之前已经打印出的字符总数，写入到对应参数指针所指向的内存地址中！**
- \`%hhn\`：只写 1 字节
- \`%hn\`：写入 2 字节
- \`%n\`：写入 4 字节
- 结合 pwntools 的 \`fmtstr_payload(offset, {printf_got: system_addr})\`，可一键将 \`printf\` 的 GOT 表篡改为 \`system\`！下一次调用 \`printf("/bin/sh")\` 就会直接拿到 Shell！`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'format-string'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_12_heap_ptmalloc',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 12：堆底层机理 | Chunk 结构 (size/flags)、Bins 链表分类与 Top Chunk',
    description: `# 🎯 模块 12：堆底层机理 | Chunk 结构 (size/flags)、Bins 链表分类与 Top Chunk

> **CTF Wiki 对应章节**：Linux Pwn -> Heap Exploitation -> ptmalloc 体系

---

## 1. 堆的本质：动态内存管理

在 Linux glibc 中，堆分配器叫 **ptmalloc**。它将内存组织为一个个 **Chunk**。

\`\`\`text
+----------------------+----------------------+
|      prev_size       |      size | A|M|P    |  <-- Chunk Header (16字节)
+----------------------+----------------------+
|                     fd                      |  <-- 用户数据区 / 空闲时指向下一个 Chunk
+---------------------------------------------+
|                     bk                      |  <-- 空闲时指向上一个 Chunk
+---------------------------------------------+
\`\`\`
- **A 标志 (NON_MAIN_ARENA)**：是否属于非主分配区
- **M 标志 (IS_MMAPPED)**：是否通过 mmap 分配
- **P 标志 (PREV_INUSE)**：前一个邻居 Chunk 是否正在被使用。若为 0，释放当前 Chunk 时会触发物理相邻块的双向合并！

---

## 2. 空闲链表（Bins）大家族

1. **Tcache（线程缓存，glibc 2.26+）**：单向链表，极速分配，容量 7 个，无安全校验。
2. **Fastbin**：单向链表，LIFO 后进先出，存放小堆块（<= 128 字节）。
3. **Unsorted Bin**：双向循环链表，刚释放的 Chunk 先暂存这里，等待重新整理。
4. **Small Bin / Large Bin**：按大小排序的双向循环链表。
5. **Top Chunk**：整个堆顶部的巨无霸储备空间。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'ptmalloc'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_13_heap_uaf_doublefree',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 13：堆核心漏洞成因 | UAF (Use-After-Free)、Double Free 与 Off-by-One/Null',
    description: `# 🎯 模块 13：堆核心漏洞成因 | UAF (Use-After-Free)、Double Free 与 Off-by-One/Null

> **CTF Wiki 对应章节**：Linux Pwn -> Heap Exploitation -> Heap Vulnerabilities

---

## 1. UAF（Use-After-Free / 释放后重用）
- **成因**：\`free(ptr)\` 后，指针没有置为 \`NULL\`（形成了悬挂指针 Wild Pointer）。
- **危害**：攻击者可以再次读取或写入已被释放的 Chunk。若该 Chunk 包含函数指针（如 C++ 虚函数表），即可直接劫持执行流！

---

## 2. Double Free（双重释放）
- **成因**：对同一个内存指针连续执行两次 \`free()\`。
- **危害**：导致同一个 Chunk 被两次塞入空闲链表，使链表形成死循环（Loop），后续申请内存即可分配出指向同一块地址的两个指针，导致任意地址写！

---

## 3. Off-by-One 与 Off-by-Null（单字节溢出）
- **成因**：边界判断错误（如循环写成了 \`i <= size\`）或字符串末尾多追加了一个 \`\\0\`。
- **危害**：刚好溢出一个字节，篡改相邻堆块的 \`size\` 字段或 \`PREV_INUSE\` 标志，触发虚假的堆块合并（Chunk Overlapping）！`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'uaf', 'double-free'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_14_heap_fastbin_tcache',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 14：链表污染利器 | Fastbin Attack 与 Tcache Poisoning (任意地址分配)',
    description: `# 🎯 模块 14：链表污染利器 | Fastbin Attack 与 Tcache Poisoning (任意地址分配)

> **CTF Wiki 对应章节**：Linux Pwn -> Heap Exploitation -> Fastbin Attack & Tcache Poisoning

---

## 1. Fastbin Attack 原理
Fastbin 是单向链表，通过 \`fd\` 指针链接下一个空闲块。
如果我们通过 UAF 或 Double Free 篡改了某个 Chunk 的 \`fd\`，将其指向任意目标地址（例如 \`__malloc_hook\` 前方）：
下一次调用两次 \`malloc\`，分配器就会把**目标地址当成合法 Chunk 分配给我们**！
*(注意：Fastbin 会检查目标地址的 size 字段是否匹配当前 bin 大小)*

---

## 2. Tcache Poisoning（现代 glibc 标配手法）
glibc 2.26 引入了 Tcache。
由于 Tcache 设计初衷是为了极致性能，在早期版本中**几乎没有任何安全校验**！
篡改 Tcache Chunk 的 \`fd\` 指针直接指向目标地址，两次 \`malloc()\` 即可直接拿到任意地址写权限（例如直接写 \`__free_hook\` 为 \`system\`），释放一个包含 \`"/bin/sh"\` 的块立刻触发提权！`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'tcache', 'fastbin'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_15_heap_unsortedbin',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 15：巨型地址泄露 | Unsorted Bin Attack 与 libc 基址定位',
    description: `# 🎯 模块 15：巨型地址泄露 | Unsorted Bin Attack 与 libc 基址定位

> **CTF Wiki 对应章节**：Linux Pwn -> Heap Exploitation -> Unsorted Bin Attack

---

## 1. Unsorted Bin 泄露 libc 基址（堆 Pwn 必修技）

当一个大于 Fastbin 大小的 Chunk 被释放后，它会被放入 **Unsorted Bin**。
Unsorted Bin 是双向循环链表，链表头部存放在 libc 的 \`main_arena\` 结构体中！
因此，当 Unsorted Bin 中只有这一个空闲块时，它的 \`fd\` 和 \`bk\` 会自动指向 **\`main_arena + offset\`**！
**利用姿势**：
通过 UAF 读取这个已释放 Chunk 的内容，直接泄露出了 libc 内部真实地址，减去固定偏移就能精准反推 **libc 基地址**！

---

## 2. 经典 Unsorted Bin Attack 任意写
通过篡改 \`bk\` 指针为 \`target_addr - 0x10\`，当触发从 Unsorted Bin 取出 Chunk 时，利用双向链表脱链操作：
\`bck->fd = bin\`
可以将一个极大的值（如 \`main_arena\` 地址）写入目标变量（如 \`global_max_fast\`），使所有堆块都被当成 Fastbin 处理！`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'unsorted-bin'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_16_heap_house_series',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 16：经典 House 兵法 | House of Force / House of Spirit / House of Orange',
    description: `# 🎯 模块 16：经典 House 兵法 | House of Force / House of Spirit / House of Orange

> **CTF Wiki 对应章节**：Linux Pwn -> Heap Exploitation -> House of ... 系列

---

## 1. House of Force（Top Chunk 尺寸篡改）
- **条件**：存在堆溢出，且能覆盖到 Top Chunk 的 \`size\` 字段。
- **手法**：将 Top Chunk 的 size 改成极大的值（如 \`0xFFFFFFFFFFFFFFFF\`）。接下来请求一个超大的 \`malloc(offset)\`，迫使 Top Chunk 指针跃迁到目标区域（如栈区或 BSS 段），实现全局任意分配！

---

## 2. House of Spirit（目标区域伪造 Chunk 头部）
- **条件**：在目标可控内存（如栈或 BSS）构造一个合法的 Chunk Header（满足 size 与相邻块 size 检查）。
- **手法**：将该指针传递给 \`free()\`，让分配器误以为这是一个合法堆块并加入 Fastbin，随后 \`malloc\` 回来获取该地址控制权！

---

## 3. House of Orange（无 free 场景下的利用传奇）
- **条件**：题目没有提供 \`free\` 函数，无法正常产生空闲链表。
- **手法**：改小 Top Chunk 的 size，请求一个大于 Top Chunk 大小的内存，迫使系统调用 \`sysmalloc -> brk\` 扩容，原来的 Top Chunk 会被自动释放进入 Unsorted Bin！随后结合 \`_IO_FILE\` 虚表劫持实现 RCE！`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'house-of-xxx'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_17_fsop_io_file',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 17：进阶虚表劫持 | _IO_FILE 结构体利用与 FSOP (文件流面向返回编程)',
    description: `# 🎯 模块 17：进阶虚表劫持 | _IO_FILE 结构体利用与 FSOP (文件流面向返回编程)

> **CTF Wiki 对应章节**：Linux Pwn -> IO_FILE Exploitation -> FSOP

---

## 1. 为什么研究 _IO_FILE？

在现代 glibc（如 glibc 2.34+）中，传统的 \`__malloc_hook\` 和 \`__free_hook\` 已经被官方彻底移除！
堆 Pwn 选手转而利用 Linux C 语言标准 I/O 结构体 —— **\`FILE\`（底层为 \`struct _IO_FILE_plus\`）**！

---

## 2. 虚函数表 (vtable) 劫持

每个 \`_IO_FILE_plus\` 结构体内部都有一个虚函数表指针 \`vtable\`，指向一组函数指针（如 \`xsputn\`、\`overflow\`、\`finish\`）。
当程序调用 \`exit()\`、\`puts()\` 或刷新缓冲区时，会自动触发 \`vtable\` 中的函数！
- **FSOP（File Stream Oriented Programming）**：通过伪造 \`_IO_list_all\` 链表中的虚假文件对象，在程序执行 \`exit()\` 刷新流时，触发我们篡改的函数指针直接执行 \`system("/bin/sh")\`！`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'io_file', 'fsop'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_18_seccomp_orw',
    projectId: d.project.id,
    milestoneId: null,
    title: '模块 18：现代沙箱防御突破 | Seccomp 沙盒与 ORW (Open-Read-Write 纯文本利用)',
    description: `# 🎯 模块 18：现代沙箱防御突破 | Seccomp 沙盒与 ORW (Open-Read-Write 纯文本利用)

> **CTF Wiki 对应章节**：Linux Pwn -> Linux Kernel / Seccomp -> ORW

---

## 1. Seccomp（安全计算模式）沙盒

在现代高难度 CTF 中，题目就算给了你提权漏洞，程序往往预先调用了 \`prctl(PR_SET_SECCOMP, ...)\` 开启沙箱！
沙箱会直接**禁用 \`execve\` 系统调用**（一执行 \`system("/bin/sh")\` 进程立刻被内核 kill 掉）。

---

## 2. ORW 突破之法（Open -> Read -> Write）

既然无法拿到交互式 Shell，我们的目标是读出服务器根目录下的 \`flag\` 文件！
我们只需要三个最基础的文件 I/O 系统调用：
1. **\`sys_open("flag", O_RDONLY)\`**：打开 flag 文件，获得文件描述符 \`fd = 3\`；
2. **\`sys_read(3, bss_addr, 0x100)\`**：将 flag 的内容读取到可写内存中；
3. **\`sys_write(1, bss_addr, 0x100)\`**：将读取到的 flag 内容直接打印到终端标准输出！

可以通过纯 Shellcode 或精心构造的系统调用 ROP 链优雅达成！`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'seccomp', 'orw'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  }
];

d.tasks = newTasks;

// Build layout coordinates and edges
// Columns:
// Col 0: 60px (Basics: 1)
// Col 1: 340px (Intro: 2, 3)
// Col 2: 620px (Canary & Libc: 4, 5, 10)
// Col 3: 900px (ROP & Pivot: 6, 7, 8, 9)
// Col 4: 1180px (Format String & Heap Basics: 11, 12, 13)
// Col 5: 1460px (Heap Advanced: 14, 15, 16)
// Col 6: 1740px (FSOP & Sandbox: 17, 18)

const nodePositions = {
  pwn_01_stack_frame: { x: 60, y: 220, note: '【已点亮】内功心法' },
  pwn_02_ret2text: { x: 340, y: 120, note: '【已点亮】基础栈溢出破冰' },
  pwn_03_protections: { x: 340, y: 320, note: '【攻克中】Linux 四大安全防护' },
  pwn_04_canary_bypass: { x: 620, y: 80, note: '【待解锁】突破 Canary 保护' },
  pwn_05_ret2libc: { x: 620, y: 240, note: '【待解锁】突破 NX 与 ret2libc' },
  pwn_10_integer_overflow: { x: 620, y: 400, note: '【待解锁】整数溢出与边界' },
  pwn_06_ret2csu: { x: 900, y: 80, note: '【待解锁】万能通用 Gadget' },
  pwn_07_stack_pivot: { x: 900, y: 240, note: '【核心必修】栈迁移与 leave;ret' },
  pwn_08_srop: { x: 900, y: 400, note: '【待解锁】SROP 信号劫持' },
  pwn_09_ret2dlresolve: { x: 900, y: 560, note: '【待解锁】无泄露 dlresolve' },
  pwn_11_format_string: { x: 1180, y: 120, note: '【待解锁】格式化字符串任意读写' },
  pwn_12_heap_ptmalloc: { x: 1180, y: 320, note: '【待解锁】堆底层 ptmalloc 体系' },
  pwn_13_heap_uaf_doublefree: { x: 1180, y: 500, note: '【待解锁】UAF 与 Double Free' },
  pwn_14_heap_fastbin_tcache: { x: 1460, y: 160, note: '【待解锁】Fastbin 与 Tcache 攻击' },
  pwn_15_heap_unsortedbin: { x: 1460, y: 340, note: '【待解锁】Unsorted Bin 泄露 libc' },
  pwn_16_heap_house_series: { x: 1460, y: 520, note: '【待解锁】经典 House 系列利用' },
  pwn_17_fsop_io_file: { x: 1740, y: 220, note: '【待解锁】_IO_FILE 虚表劫持 (FSOP)' },
  pwn_18_seccomp_orw: { x: 1740, y: 420, note: '【终极阶段】Seccomp 沙盒与 ORW 绕过' }
};

const nodes = newTasks.map(t => {
  const pos = nodePositions[t.id] || { x: 2000, y: 200, note: '' };
  return {
    taskId: t.id,
    x: pos.x,
    y: pos.y,
    collapsed: false,
    note: pos.note
  };
});

const edges = [
  // 1 -> 2, 3
  { id: 'edge_1_2', fromTaskId: 'pwn_01_stack_frame', toTaskId: 'pwn_02_ret2text', kind: 'hard', createdAt: now },
  { id: 'edge_1_3', fromTaskId: 'pwn_01_stack_frame', toTaskId: 'pwn_03_protections', kind: 'hard', createdAt: now },
  
  // 2 -> 4, 3 -> 4, 5, 10
  { id: 'edge_2_4', fromTaskId: 'pwn_02_ret2text', toTaskId: 'pwn_04_canary_bypass', kind: 'hard', createdAt: now },
  { id: 'edge_3_4', fromTaskId: 'pwn_03_protections', toTaskId: 'pwn_04_canary_bypass', kind: 'hard', createdAt: now },
  { id: 'edge_3_5', fromTaskId: 'pwn_03_protections', toTaskId: 'pwn_05_ret2libc', kind: 'hard', createdAt: now },
  { id: 'edge_3_10', fromTaskId: 'pwn_03_protections', toTaskId: 'pwn_10_integer_overflow', kind: 'hard', createdAt: now },
  
  // 5 -> 6, 7, 8, 9
  { id: 'edge_5_6', fromTaskId: 'pwn_05_ret2libc', toTaskId: 'pwn_06_ret2csu', kind: 'hard', createdAt: now },
  { id: 'edge_5_7', fromTaskId: 'pwn_05_ret2libc', toTaskId: 'pwn_07_stack_pivot', kind: 'hard', createdAt: now },
  { id: 'edge_5_8', fromTaskId: 'pwn_05_ret2libc', toTaskId: 'pwn_08_srop', kind: 'hard', createdAt: now },
  { id: 'edge_5_9', fromTaskId: 'pwn_05_ret2libc', toTaskId: 'pwn_09_ret2dlresolve', kind: 'hard', createdAt: now },
  
  // 4 -> 11, 7 -> 12, 10 -> 12
  { id: 'edge_4_11', fromTaskId: 'pwn_04_canary_bypass', toTaskId: 'pwn_11_format_string', kind: 'hard', createdAt: now },
  { id: 'edge_7_12', fromTaskId: 'pwn_07_stack_pivot', toTaskId: 'pwn_12_heap_ptmalloc', kind: 'hard', createdAt: now },
  { id: 'edge_10_12', fromTaskId: 'pwn_10_integer_overflow', toTaskId: 'pwn_12_heap_ptmalloc', kind: 'hard', createdAt: now },
  
  // 12 -> 13 -> 14, 15, 16
  { id: 'edge_12_13', fromTaskId: 'pwn_12_heap_ptmalloc', toTaskId: 'pwn_13_heap_uaf_doublefree', kind: 'hard', createdAt: now },
  { id: 'edge_13_14', fromTaskId: 'pwn_13_heap_uaf_doublefree', toTaskId: 'pwn_14_heap_fastbin_tcache', kind: 'hard', createdAt: now },
  { id: 'edge_13_15', fromTaskId: 'pwn_13_heap_uaf_doublefree', toTaskId: 'pwn_15_heap_unsortedbin', kind: 'hard', createdAt: now },
  { id: 'edge_13_16', fromTaskId: 'pwn_13_heap_uaf_doublefree', toTaskId: 'pwn_16_heap_house_series', kind: 'hard', createdAt: now },
  
  // 14, 15 -> 17, 18
  { id: 'edge_15_17', fromTaskId: 'pwn_15_heap_unsortedbin', toTaskId: 'pwn_17_fsop_io_file', kind: 'hard', createdAt: now },
  { id: 'edge_16_18', fromTaskId: 'pwn_16_heap_house_series', toTaskId: 'pwn_18_seccomp_orw', kind: 'hard', createdAt: now },
  { id: 'edge_7_18', fromTaskId: 'pwn_07_stack_pivot', toTaskId: 'pwn_18_seccomp_orw', kind: 'soft', createdAt: now }
];

d.dependencyViews = [
  {
    id: 'view_pwn_skilltree',
    projectId: d.project.id,
    name: '🌟 CTF Wiki 全景体系：Pwn 二进制安全技能树',
    description: '完全对标 CTF Wiki 与真实攻防战法：涵盖汇编调用栈、基础栈溢出、Canary绕过、ret2libc、万能ret2csu、栈迁移(leave;ret)、SROP、dlresolve、格式化字符串、ptmalloc堆利用全家桶(Tcache/Unsorted Bin/House系列)、FSOP与Seccomp沙盒绕过。',
    dimension: null,
    createdAt: now,
    updatedAt: now,
    revision: 2,
    nodes: nodes,
    edges: edges
  }
];

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log(`✅ Successfully updated curriculum to ${newTasks.length} modules aligning with CTF Wiki!`);
