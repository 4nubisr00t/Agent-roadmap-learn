import fs from 'fs';
import path from 'path';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
const now = new Date().toISOString();

const tasks = [
  {
    id: 'pwn_0_1_vmem',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 0.1：虚拟内存分段模型 (Linux ELF 内存空间与权限边界)',
    description: `# 🎯 节点 0.1：虚拟内存分段模型 (Linux ELF 内存空间与权限边界)

> **知识沉淀**：物理隔离，代码段 r-x 禁止修改，栈段 rw- 执行受限 (NX 根源)。栈与堆对向生长。

---

## 1. 用户态虚拟地址拓扑 (47 位寻址)

在 Linux 64 位体系下，每个进程独占 128TB 的虚拟用户空间 (\`0x0000000000000000\` ~ \`0x00007fffffffffff\`)：

\`\`\`text
高地址 0x7fffffffffff
+------------------------------------+
| 内核空间 (Kernel Space, 用户不可访) |
+------------------------------------+
| 环境变量 (Environment) 与命令行参数 |
+------------------------------------+
| 栈 (Stack) [向低地址生长 ↓] (rw-)   |  <-- 存放局部变量、Saved RBP、Saved RET
+------------------------------------+
| ... (动态映射未分配空间) ...       |
+------------------------------------+
| 共享库映射区 (libc.so / mmap) (r-x) |  <-- 动态链接库装载区
+------------------------------------+
| ...                                |
+------------------------------------+
| 堆 (Heap) [向高地址生长 ↑] (rw-)    |  <-- brk / sbrk 扩展，malloc 堆块
+------------------------------------+
| .bss 段 (未初始化全局变量) (rw-)     |  <-- 默认全 0，常用于栈迁移目标
+------------------------------------+
| .data 段 (已初始化全局变量) (rw-)    |
+------------------------------------+
| .got / .got.plt (全局偏移表) (rw-)   |  <-- 存放函数真实绝对地址，可劫持
+------------------------------------+
| .plt (过程链接表) (r-x)             |  <-- 代码跳板，固定只读
+------------------------------------+
| .text (机器指令代码段) (r-x)        |  <-- 程序本身代码，不可写
+------------------------------------+
低地址 0x000000400000 (No-PIE基址)
\`\`\`

---

## 2. 三权分立 (R / W / X)
- **代码段 (.text)**：\`r-x\`（可读、可执行、严禁写入）。
- **数据段/堆/栈 (.data, .bss, heap, stack)**：\`rw-\`（可读、可写、不可执行）。
- **NX 机制本质**：CPU 通过页表项的 XD/NX 位限制执行权限。如果攻击者往栈上注入 Shellcode 机器码并强行让 CPU 跳过去执行，MMU 会立刻抛出硬件中断，内核直接下发 \`SIGSEGV\` 终止进程！`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'memory', 'foundations'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_0_2_registers',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 0.2：CPU 寄存器体系与 5 大控制流微操作拆解',
    description: `# 🎯 节点 0.2：CPU 寄存器体系与 5 大控制流微操作拆解

> **知识沉淀**：微操作透视。call 自动压栈 RET，ret 等价于盲目 pop rip。64位 ABI 传参：RDI → RSI → RDX → RCX → R8 → R9。

---

## 1. 核心寄存器分工

- **\`RIP\` (Instruction Pointer)**：黑客终极目标。存放下一条待执行指令的内存虚拟地址。
- **\`RSP\` (Stack Pointer)**：栈顶指针，永远指向当前物理栈顶（最小有效内存地址）。
- **\`RBP\` (Base Pointer)**：栈底指针，用于定位当前函数栈帧的基准锚点。
- **64 位传参顺序 (System V AMD64 ABI)**：
  \`\`\`text
  第1参数: RDI  -->  第2参数: RSI  -->  第3参数: RDX  -->
  第4参数: RCX  -->  第5参数: R8   -->  第6参数: R9
  (超过 6 个参数的部分，才从右向左依次压入栈中)
  \`\`\`

---

## 2. 5 大汇编微操作物理拆解

1. **\`push <src>\`**：
   - \`RSP = RSP - 8\`（栈顶向低地址扩展 8 字节）
   - \`[RSP] = src\`（把数据存入新栈顶）
2. **\`pop <dest>\`**：
   - \`dest = [RSP]\`（读取当前栈顶数据灌入目标寄存器）
   - \`RSP = RSP + 8\`（栈顶向高地址收缩 8 字节）
3. **\`call <func>\`**：
   - \`push RIP_next\`（将 call 的下一条指令物理地址压入栈顶，形成 **Saved Return Address**！）
   - \`RIP = func\`（程序跳转至目标函数首地址）
4. **\`ret\`**：
   - **等价于 \`pop rip\`**：直接从当前栈顶弹出 8 字节强制灌入 \`RIP\`，随后 \`RSP = RSP + 8\`。
   - **漏洞根源**：CPU 执行 \`ret\` 时完全处于**盲目信任状态**，只要栈顶被恶意溢出修改，CPU 就会无条件跳往攻击者指定的地址！
5. **\`leave\`**：
   - \`mov rsp, rbp\`（瞬间撤销当前函数开辟的局部变量空间）
   - \`pop rbp\`（恢复调用者的父栈帧基址，RSP 自增 8）`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'registers', 'assembly'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_0_3_plt_got',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 0.3：动态链接底层机理：PLT 办事窗口与 GOT 通讯录',
    description: `# 🎯 节点 0.3：动态链接底层机理：PLT 办事窗口与 GOT 通讯录

> **知识沉淀**：核心心智。PLT 是只读固定办事窗口，GOT 是可写可查通讯录。读 GOT 破 ASLR 随机化，写 GOT 换函数指针。

---

## 1. 为什么需要 PLT 与 GOT？

1. **矛盾一（代码段严禁写入）**：\`.text\` 代码段是只读的 (\`r-x\`)，运行时绝不允许动态修补指令地址。
2. **矛盾二（ASLR 动态加载）**：开启 ASLR 后，\`libc.so\` 每次运行加载到内存的基地址完全随机变动，编译器在静态编译时根本不可能知道 \`puts\` 或 \`printf\` 的实际物理地址！

**解决方案**：
- **PLT (Procedure Linkage Table，过程链接表)**：位于代码段，固定只读。是你调用函数的“固定办事窗口”。代码永远只写 \`call puts@plt\`。
- **GOT (Global Offset Table，全局偏移表)**：位于数据段，可读可写 (\`rw-\`)。是操作系统的“通讯录表格”。每一行记录一个函数的真实物理地址。

---

## 2. 延迟绑定 (Lazy Binding) 物理执行流

- **第 1 次调用 \`puts@plt\`**：
  1. 跳到 \`puts@plt\`；
  2. 翻看 \`puts@got\`，发现里面还没解析（放着跳回 PLT 的下一行指令）；
  3. PLT 触发动态链接器 \`_dl_runtime_resolve\`；
  4. 动态链接器查出 \`puts\` 在当前 libc 中的实际真实地址，亲手写进 \`puts@got\`！
  5. 跳去执行真正的 \`puts\`。
- **第 2 次及以后调用 \`puts@plt\`**：
  直接从 \`puts@got\` 取出已经写好的真实地址，一枪直达，不再消耗性能！

---

## 3. Pwn 攻防实战价值
- **泄露 GOT 表 (Leak Base)**：GOT 表存放着 libc 函数的真实物理地址。只要通过漏洞把它打印出来，减去 libc 内部固定符号偏移，立刻精准反推整个 \`libc_base\`！
- **篡改 GOT 表 (GOT Hijack)**：在 Partial RELRO 保护下，GOT 表可写。将 \`puts@got\` 覆写为 \`system\` 地址，下一次程序执行 \`puts("/bin/sh")\` 就会瞬间弹出 Shell！`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'plt-got', 'lazy-binding'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_1_0_ret2text',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 1.0：栈帧劫持与控制流夺取 (ret2text & MOVAPS 对齐陷阱)',
    description: `# 🎯 节点 1.0：栈帧劫持与控制流夺取 (ret2text & MOVAPS 对齐陷阱)

> **知识沉淀**：物理本质。call 与 ret 导致的 8 字节奇偶错位。垫一个纯 ret 垫高 8 字节破除 movaps 崩溃。

---

## 1. 物理对冲与覆写偏移精确测算

在 64 位 x86_64 体系中：
\`\`\`c
void vuln() {
    char buf[32];
    gets(buf); // 致命漏洞：无输入边界检查
}
\`\`\`
- 栈由高向低生长，而数组从低向高写入！
- 覆写链条：\`buf[32]\` (32字节) $\to$ \`Saved RBP\` (8字节) $\to$ **\`Saved RET\` (8字节，攻击目标)**！
- 填充偏移：\(32 + 8 = 40\) 字节！

---

## 2. 致命暗坑：MOVAPS 16 字节对齐崩溃

在 64 位 Ubuntu 18.04+ 系统中，很多初学者精准覆盖了 40 字节跳向 \`system("/bin/sh")\`，程序却莫名其妙报段错误 (SIGSEGV) 崩溃！
- **硬件原因**：\`system()\` 内部调用了 64 位 SIMD 矢量加速指令 \`movaps\`，**该指令死板要求执行时当前栈顶指针 RSP 必须以 16 字节对齐（即十六进制末位必须为 0）**！
- **时空错位**：正常情况下函数是通过 \`call\` 进入的（\`call\` 压栈 8 字节）；黑客是通过 \`ret\` 强跳的（少了一次压栈），导致到达 \`system\` 时 RSP 末尾是 8 而不是 0，硬件直接自杀！
- **解决神技**：在 Payload 中插入一个什么都不干的纯 **\`ret\` gadget**：
  \`\`\`python
  payload = b'A' * 40 + p64(ret_gadget) + p64(backdoor_addr)
  \`\`\`
  纯 \`ret\` 指令在物理上消耗栈顶 8 字节（\`RSP = RSP + 8\`），末尾 8 变 0，瞬间完成 16 字节对齐，丝滑拿到 Shell！`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'ret2text', 'movaps'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_1_1_stack_pivot',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 1.1：空间受限绝杀：栈迁移 (Stack Pivoting / 双重 leave;ret)',
    description: `# 🎯 节点 1.1：空间受限绝杀：栈迁移 (Stack Pivoting / 双重 leave;ret)

> **知识沉淀**：微指令托盘。原 leave 改 RBP $\to$ 原 ret 进 gadget $\to$ 新 leave 的 mov rsp, rbp 把栈搬家到 BSS 段。头部必留 8 字节垃圾给 pop rbp 吃掉！

---

## 1. 致命场景：溢出空间极度狭窄

当题目只允许溢出 16 字节（刚好覆盖 Saved RBP + Saved RET），根本塞不下长长的 ROP 链时：
**核心打法：把当前栈顶指针 RSP 强行“绑架迁移”到由我们完全掌控的大片空闲区域（如全局 BSS 段）！**

---

## 2. 连续两次 \`leave; ret\` 的物理慢动作拆解

### 准备阶段：
- **Stage 1 (新家布局)**：在 BSS 段（地址 \`fake_stack\`）提前写入：
  - **偏移 +0 (前 8 字节)**：放 8 字节垃圾数据（例如 \`b'AAAAAAAA'\`）。**这是专门给新家第 2 次 leave 中的 \`pop rbp\` 吃掉的！**
  - **偏移 +8 (紧接着的 8 字节)**：放真正要执行的后门函数或 ROP 链！
- **Stage 2 (引爆迁移)**：在原函数栈上精准布局：
  - \`Saved RBP\` 篡改为：\`fake_stack\`（BSS 段首地址）
  - \`Saved RET\` 篡改为：程序自带的 \`leave; ret\` gadget 地址！

### 四步硬件物理交接：
1. **原函数执行自带的 \`leave\`**：
   - \`mov rsp, rbp\`（回收栈）
   - \`pop rbp\`：从栈顶把我们写入的 \`fake_stack\` 弹出到 **RBP 寄存器**！此时 RBP 已经被调包！
2. **原函数执行自带的 \`ret\`**：
   - 从栈顶弹出返回地址，跳向我们安排的 \`leave; ret\` gadget！
3. **进入 Gadget 执行第 2 次 \`leave\`（乾坤大挪移核心）**：
   - **\`mov rsp, rbp\`**：此时 RBP 是 \`fake_stack\`，**RSP 瞬间闪现物理降落到 BSS 段！栈迁移完成！**
   - **\`pop rbp\`**：从 BSS 栈顶吃掉前 8 字节垃圾数据，\`RSP = fake_stack + 8\`！
4. **进入 Gadget 执行第 2 次 \`ret\`**：
   - 从 \`fake_stack + 8\` 弹出真正的后门函数或 ROP 链装入 \`RIP\`，Shell 破土而出！`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'stack-pivot', 'leave-ret'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_1_canary',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.1：Canary 栈金丝雀机制与信息泄露突破 (Canary Leak & Bypass)',
    description: `# 🎯 节点 2.1：Canary 栈金丝雀机制与信息泄露突破 (Canary Leak & Bypass)

> **知识沉淀**：末尾 \\x00 截断保护。覆盖末位 \\x00 借 puts/printf 喷出 7 字节 Canary，加 \\x00 还原后原样填回 Payload 完美避开报警自爆。

---

## 1. 编译器暗桩埋雷机理

编译开启 Canary (\`-fstack-protector\`) 后：
- **函数入口 (埋哨兵)**：
  \`\`\`asm
  mov rax, QWORD PTR fs:0x28    # 从 TLS 线程局部存储读取随机金丝雀
  mov QWORD PTR [rbp-0x8], rax  # 钉死在局部变量与 Saved RBP 之间
  xor eax, eax                  # 清空 RAX 防止泄露
  \`\`\`
- **函数出口 (查哨兵)**：
  \`\`\`asm
  mov rax, QWORD PTR [rbp-0x8]
  xor rax, QWORD PTR fs:0x28
  jne 0x401040 <__stack_chk_fail@plt> # 只要差 1 位立刻报警自爆！
  \`\`\`
- **末位 \\x00 截断防线**：操作系统强制将 64 位 Canary 最低有效字节设为 \`0x00\`（小端序内存首字节），防止 C 语言字符串函数 (\`puts\`/\`printf("%s")\`) 把 Canary 顺手打印出来。

---

## 2. 经典战法：覆写截断位并借刀泄露

- **第一轮交互 (剥皮)**：输入正好覆盖到 Canary 的最低字节，用普通非空字符覆盖掉这个 \`\x00\`！
- **触发打印**：调用 \`printf/puts\` 时由于找不到 \`\x00\`，会一路顺藤摸瓜将 Canary 剩下的 7 个字节全部喷到终端！
- **Python 还原**：
  \`\`\`python
  canary = u64(b'\\x00' + leaked_7_bytes)
  \`\`\`
- **第二轮交互 (原样填回)**：构造溢出 Payload 时，在 \`[rbp-0x8]\` 位置把真实的 \`canary\` 原模原样塞回去，守卫检查直接通过，程序被调包执行流！`,
    status: 'done',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: now,
    tags: ['pwn', 'canary', 'leak'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_2_rop_ret2syscall',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.2：突破 NX 拦截：ROP 导向编程与系统调用链 (ret2syscall)',
    description: `# 🎯 节点 2.2：突破 NX 拦截：ROP 导向编程与系统调用链 (ret2syscall)

> **知识沉淀**：数据不可执行下拼接代码片段 (Gadgets)。利用 syscall / int 0x80 手工配置寄存器发起系统调用。

---

## 1. 为什么会有 ROP？(场景冲突)

在开启了 **NX / DEP（数据执行保护）** 之后：
- 栈和堆段标记为不可执行 (\`rw-\`)。黑客就算把 Shellcode 塞进内存，一旦跳过去，CPU MMU 硬件立刻报段错误杀掉进程。
- **破解第一性原理**：既然我们不能**创造**可执行代码，我们就**借用**目标程序自身 \`.text\` 代码段里现成的、原本就允许执行的汇编碎片！
- 这些以 \`ret\` 结尾的汇编碎片，就叫 **Gadgets（代码零件）**。把一个个零件通过栈串联起来，就叫 **ROP（Return-Oriented Programming）**！

---

## 2. 攻坚靶标：系统调用 \`execve("/bin/sh", 0, 0)\`

在 Linux x86_64 体系下，直接呼叫内核启动 Shell 需要配置好以下寄存器：
- \`RAX\` = **59** (\`0x3b\`，\`sys_execve\` 的系统调用号)
- \`RDI\` = **指向字符串 \`"/bin/sh"\` 的物理内存地址**
- \`RSI\` = **0** (\`argv = NULL\`)
- \`RDX\` = **0** (\`envp = NULL\`)
- 触发指令：**\`syscall\`**

---

## 3. 寻找零件与装配工序 (ROP 拼图)

使用 \`ROPgadget --binary ./pwn_task\` 搜寻以下现成指令：
1. \`pop rax; ret\`
2. \`pop rdi; ret\`
3. \`pop rsi; pop rdx; ret\`
4. \`syscall; ret\`

### 栈上装配的 Payload 物理透视图：
\`\`\`text
低地址
+------------------------------------+
| 垃圾填充数据 (Padding 冲垮 Saved RBP)|
+------------------------------------+
| p64(pop_rax_ret)                   |  <-- Saved RET 第一跳
+------------------------------------+
| 59 (0x3b)                          |  <-- 被弹入 RAX 作为系统调用号
+------------------------------------+
| p64(pop_rdi_ret)                   |
+------------------------------------+
| p64(binsh_addr)                    |  <-- 被弹入 RDI，指向 "/bin/sh"
+------------------------------------+
| p64(pop_rsi_rdx_ret)               |
+------------------------------------+
| 0                                  |  <-- 被弹入 RSI
+------------------------------------+
| 0                                  |  <-- 被弹入 RDX
+------------------------------------+
| p64(syscall_ret)                   |  <-- 硬件下发系统调用，直接夺得 Root Shell！
+------------------------------------+
高地址
\`\`\`

---

## 🎯 节点 2.2 通关考核自测题
1. 为什么在 32 位 Linux 中系统调用号是放进 \`EAX\` 并且使用 \`int 0x80\` 触发，而在 64 位中是使用 \`syscall\` 且系统调用号完全不同（例如 32位 execve 是 11，64位是 59）？
2. 如果在程序中找不到现成的 \`"/bin/sh"\` 字符串，我们可以利用哪两个系统调用（提示：输入函数和全局变量区）先往程序里写一个 \`"/bin/sh"\`？`,
    status: 'in-progress',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'rop', 'ret2syscall'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_3_ret2libc',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.3：突破 ASLR 随机化：ret2libc 与 GOT 地址泄露反推基址',
    description: `# 🎯 节点 2.3：突破 ASLR 随机化：ret2libc 与 GOT 地址泄露反推基址

> **知识沉淀**：运行时代基址随机化、信息泄露计算 Base、符号解析劫持。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'aslr', 'ret2libc'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_4_relro',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.4：RELRO 约束机制：Partial 与 Full RELRO 对 GOT 覆写的硬性封锁',
    description: `# 🎯 节点 2.4：RELRO 约束机制：Partial 与 Full RELRO 对 GOT 覆写的硬性封锁

> **知识沉淀**：Partial vs Full RELRO 机制对 GOT 覆写可行性的硬性封锁。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'relro'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_5_ret2csu',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.5：万能通用 Gadget：__libc_csu_init 控制 rdi/rsi/rdx 寄存器传参 (ret2csu)',
    description: `# 🎯 节点 2.5：万能通用 Gadget：__libc_csu_init 控制 rdi/rsi/rdx 寄存器传参 (ret2csu)

> **知识沉淀**：缺乏指定寄存器 gadget 时的通用破局神器。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'ret2csu'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_6_srop',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.6：信号机制劫持：SROP (Sigreturn Oriented Programming 系统调用伪造上下文)',
    description: `# 🎯 节点 2.6：信号机制劫持：SROP (Sigreturn Oriented Programming 系统调用伪造上下文)

> **知识沉淀**：利用 sigreturn 系统调用一次性强控所有物理寄存器。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'srop'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_2_7_ret2dlresolve',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 2.7：无泄露终极武器：ret2dlresolve 伪造动态链接重定位表',
    description: `# 🎯 节点 2.7：无泄露终极武器：ret2dlresolve 伪造动态链接重定位表

> **知识沉淀**：无任何输出函数时，利用 _dl_runtime_resolve 动态解析并执行 system。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'ret2dlresolve'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_3_0_format_string',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 3.0：格式化字符串原语：%p 栈遍历泄露、%s 内存解引用与 %n 分段覆写指针',
    description: `# 🎯 节点 3.0：格式化字符串原语：%p 栈遍历泄露、%s 内存解引用与 %n 分段覆写指针

> **知识沉淀**：参数位置定位、任意地址读写魔术。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'fmtstr'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_4_0_integer_overflow',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 4.0：整数安全与边界溢出：有符号/无符号转换失真、整型截断导致的检查绕过',
    description: `# 🎯 节点 4.0：整数安全与边界溢出：有符号/无符号转换失真、整型截断导致的检查绕过

> **知识沉淀**：边界安全与隐式类型转换陷阱。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'integeroverflow'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_5_0_heap_ptmalloc',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.0：Glibc 堆利用基石：Chunk 头部元数据、Bin 链表管理、Arena 状态翻转',
    description: `# 🎯 节点 5.0：Glibc 堆利用基石：Chunk 头部元数据、Bin 链表管理、Arena 状态翻转

> **知识沉淀**：ptmalloc 堆分配器核心体系。`,
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
    id: 'pwn_5_1_uaf_doublefree',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.1：堆核心漏洞成因：UAF (Use-After-Free)、Double Free 与 Off-by-One/Null',
    description: `# 🎯 节点 5.1：堆核心漏洞成因：UAF (Use-After-Free)、Double Free 与 Off-by-One/Null

> **知识沉淀**：堆悬挂指针与边界单字节溢出。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'uaf', 'doublefree'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_5_2_fastbin_tcache',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.2：链表污染与任意分配：Fastbin Attack 与 Tcache Poisoning',
    description: `# 🎯 节点 5.2：链表污染与任意分配：Fastbin Attack 与 Tcache Poisoning

> **知识沉淀**：单向链表 fd 指针篡改与任意地址写。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'fastbin', 'tcache'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_5_3_unsortedbin',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.3：巨型地址泄露：Unsorted Bin Attack 与 libc 基址定位',
    description: `# 🎯 节点 5.3：巨型地址泄露：Unsorted Bin Attack 与 libc 基址定位

> **知识沉淀**：双向循环链表 fd/bk 泄露 main_arena 与写入任意超大值。`,
    status: 'todo',
    priority: 'high',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'unsortedbin'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_5_4_house_series',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.4：进阶 House 兵法：House of Force / House of Spirit / House of Orange',
    description: `# 🎯 节点 5.4：进阶 House 兵法：House of Force / House of Spirit / House of Orange

> **知识沉淀**：Top Chunk 尺寸篡改、伪造合法块、无 free 场景下的 sysmalloc 提权。`,
    status: 'todo',
    priority: 'medium',
    assignedTo: null,
    estimatedHours: null,
    actualHours: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    tags: ['pwn', 'heap', 'house'],
    metadata: {},
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'pwn_5_5_fsop',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 5.5：虚表劫持巅峰：_IO_FILE 结构体利用与 FSOP (文件流面向返回编程)',
    description: `# 🎯 节点 5.5：虚表劫持巅峰：_IO_FILE 结构体利用与 FSOP (文件流面向返回编程)

> **知识沉淀**：现代 glibc 移除 hook 后的文件流虚表劫持 RCE。`,
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
    id: 'pwn_6_0_seccomp_orw',
    projectId: d.project.id,
    milestoneId: null,
    title: '节点 6.0：现代沙箱防御突破：Seccomp 规则分析与 ORW (Open-Read-Write 纯文本利用)',
    description: `# 🎯 节点 6.0：现代沙箱防御突破：Seccomp 规则分析与 ORW (Open-Read-Write 纯文本利用)

> **知识沉淀**：execve 被禁用时的 open/read/write 纯提取 flag 战法。`,
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

d.tasks = tasks;

// Layout positions for ReactFlow
const positions = {
  pwn_0_1_vmem: { x: 50, y: 150, note: '[v] 虚拟内存分段与权限边界' },
  pwn_0_2_registers: { x: 50, y: 350, note: '[v] CPU 寄存器与微操作' },
  pwn_0_3_plt_got: { x: 330, y: 150, note: '[v] 动态链接 PLT/GOT 延迟绑定' },
  pwn_1_0_ret2text: { x: 330, y: 350, note: '[v] 栈帧劫持 ret2text & MOVAPS' },
  pwn_1_1_stack_pivot: { x: 610, y: 150, note: '[v] 栈迁移 leave;ret 空间绝杀' },
  pwn_2_1_canary: { x: 610, y: 350, note: '[v] Canary 截断泄露与绕过' },
  
  // CURRENT BATTLEFRONT: 2.2
  pwn_2_2_rop_ret2syscall: { x: 890, y: 150, note: '[>] 当前攻坚：NX 与 ret2syscall' },
  pwn_2_3_ret2libc: { x: 890, y: 350, note: '[ ] ASLR 破除与 ret2libc' },
  pwn_2_4_relro: { x: 890, y: 550, note: '[ ] RELRO 机制对 GOT 封锁' },
  pwn_2_5_ret2csu: { x: 1170, y: 150, note: '[ ] __libc_csu_init 万能 Gadget' },
  pwn_2_6_srop: { x: 1170, y: 350, note: '[ ] SROP 信号上下文伪造' },
  pwn_2_7_ret2dlresolve: { x: 1170, y: 550, note: '[ ] 无泄露 ret2dlresolve' },
  
  pwn_3_0_format_string: { x: 1450, y: 150, note: '[ ] 格式化字符串任意读写' },
  pwn_4_0_integer_overflow: { x: 1450, y: 350, note: '[ ] 整数溢出与符号截断' },
  
  pwn_5_0_heap_ptmalloc: { x: 1730, y: 150, note: '[ ] 堆底层 ptmalloc 体系' },
  pwn_5_1_uaf_doublefree: { x: 1730, y: 350, note: '[ ] 堆核心漏洞 UAF/DoubleFree' },
  pwn_5_2_fastbin_tcache: { x: 2010, y: 100, note: '[ ] Fastbin 与 Tcache 攻击' },
  pwn_5_3_unsortedbin: { x: 2010, y: 250, note: '[ ] Unsorted Bin 泄露 libc' },
  pwn_5_4_house_series: { x: 2010, y: 400, note: '[ ] 经典 House 系列利用' },
  pwn_5_5_fsop: { x: 2010, y: 550, note: '[ ] _IO_FILE 虚表劫持 FSOP' },
  pwn_6_0_seccomp_orw: { x: 2290, y: 320, note: '[ ] Seccomp 沙盒与 ORW' }
};

const nodes = tasks.map(t => {
  const p = positions[t.id] || { x: 100, y: 100, note: '' };
  return {
    taskId: t.id,
    x: p.x,
    y: p.y,
    collapsed: false,
    note: p.note
  };
});

const edges = [
  // 0.1, 0.2 -> 0.3, 1.0
  { id: 'e_01_03', fromTaskId: 'pwn_0_1_vmem', toTaskId: 'pwn_0_3_plt_got', kind: 'hard', createdAt: now },
  { id: 'e_02_10', fromTaskId: 'pwn_0_2_registers', toTaskId: 'pwn_1_0_ret2text', kind: 'hard', createdAt: now },
  // 1.0 -> 1.1, 2.1
  { id: 'e_10_11', fromTaskId: 'pwn_1_0_ret2text', toTaskId: 'pwn_1_1_stack_pivot', kind: 'hard', createdAt: now },
  { id: 'e_10_21', fromTaskId: 'pwn_1_0_ret2text', toTaskId: 'pwn_2_1_canary', kind: 'hard', createdAt: now },
  // 1.1, 2.1 -> 2.2
  { id: 'e_11_22', fromTaskId: 'pwn_1_1_stack_pivot', toTaskId: 'pwn_2_2_rop_ret2syscall', kind: 'hard', createdAt: now },
  { id: 'e_21_22', fromTaskId: 'pwn_2_1_canary', toTaskId: 'pwn_2_2_rop_ret2syscall', kind: 'hard', createdAt: now },
  // 2.2 -> 2.3, 2.4
  { id: 'e_22_23', fromTaskId: 'pwn_2_2_rop_ret2syscall', toTaskId: 'pwn_2_3_ret2libc', kind: 'hard', createdAt: now },
  { id: 'e_23_24', fromTaskId: 'pwn_2_3_ret2libc', toTaskId: 'pwn_2_4_relro', kind: 'hard', createdAt: now },
  { id: 'e_23_25', fromTaskId: 'pwn_2_3_ret2libc', toTaskId: 'pwn_2_5_ret2csu', kind: 'hard', createdAt: now },
  { id: 'e_22_26', fromTaskId: 'pwn_2_2_rop_ret2syscall', toTaskId: 'pwn_2_6_srop', kind: 'hard', createdAt: now },
  { id: 'e_23_27', fromTaskId: 'pwn_2_3_ret2libc', toTaskId: 'pwn_2_7_ret2dlresolve', kind: 'hard', createdAt: now },
  // 2.1 -> 3.0, 4.0
  { id: 'e_21_30', fromTaskId: 'pwn_2_1_canary', toTaskId: 'pwn_3_0_format_string', kind: 'hard', createdAt: now },
  { id: 'e_10_40', fromTaskId: 'pwn_1_0_ret2text', toTaskId: 'pwn_4_0_integer_overflow', kind: 'hard', createdAt: now },
  // 3.0, 4.0, 2.3 -> 5.0
  { id: 'e_23_50', fromTaskId: 'pwn_2_3_ret2libc', toTaskId: 'pwn_5_0_heap_ptmalloc', kind: 'hard', createdAt: now },
  { id: 'e_50_51', fromTaskId: 'pwn_5_0_heap_ptmalloc', toTaskId: 'pwn_5_1_uaf_doublefree', kind: 'hard', createdAt: now },
  { id: 'e_51_52', fromTaskId: 'pwn_5_1_uaf_doublefree', toTaskId: 'pwn_5_2_fastbin_tcache', kind: 'hard', createdAt: now },
  { id: 'e_51_53', fromTaskId: 'pwn_5_1_uaf_doublefree', toTaskId: 'pwn_5_3_unsortedbin', kind: 'hard', createdAt: now },
  { id: 'e_51_54', fromTaskId: 'pwn_5_1_uaf_doublefree', toTaskId: 'pwn_5_4_house_series', kind: 'hard', createdAt: now },
  { id: 'e_53_55', fromTaskId: 'pwn_5_3_unsortedbin', toTaskId: 'pwn_5_5_fsop', kind: 'hard', createdAt: now },
  { id: 'e_22_60', fromTaskId: 'pwn_2_2_rop_ret2syscall', toTaskId: 'pwn_6_0_seccomp_orw', kind: 'soft', createdAt: now },
  { id: 'e_55_60', fromTaskId: 'pwn_5_5_fsop', toTaskId: 'pwn_6_0_seccomp_orw', kind: 'soft', createdAt: now }
];

d.dependencyViews = [
  {
    id: 'view_pwn_skilltree',
    projectId: d.project.id,
    name: '🌟 Pwn 全景知识画布与技能拓扑树 (对标 PDF 聊天记录 & CTF Wiki)',
    description: '100% 还原用户在 Gemini 网页版已完成的 0.1~2.1 节点，并直接在 2.2 (NX 与 ret2syscall) 无缝接棒！结合本地 F:\\Awdp\\knowledge (CTF Wiki / how2heap / AWDP 军规)。',
    dimension: null,
    createdAt: now,
    updatedAt: now,
    revision: 3,
    nodes: nodes,
    edges: edges
  }
];

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log('✅ Successfully updated roadmap to match PDF & AWDP knowledge base exactly!');
