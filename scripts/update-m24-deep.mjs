import fs from 'fs';

const file = 'C:/Users/LLZY2/.roadmap-skill/projects/proj_1792501168121_wfulv9v.json';
const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
const t = d.tasks.find(x => x.id === 'pwn_2_4_relro');

t.description = `# 🎯 节点 2.4：RELRO 约束机制：Partial 与 Full RELRO 对 GOT 覆写的硬性封锁

> **核心认知沉淀**：Partial vs Full RELRO 机制对 GOT 覆写可行性的硬性封锁。延迟绑定 (Lazy Binding) 的安全代价；BIND_NOW 彻底封死 GOT 劫持后的攻防转进之道。

---

## 一、 场景矛盾与第一性原理（为什么会有 RELRO？）

### 1. 致命后门：被黑客反复蹂躏的 GOT 表
在前面的节点（0.3、2.3）中，我们见证了 **GOT 表（Global Offset Table，全局偏移表）** 的巨大威力：
- GOT 表存放着每一个外部动态函数的真实内存地址（如 \`puts@got\`）。
- 以前很多二进制题目中，黑客只要搞到一个“任意地址写”的漏洞，就会像变魔术一样：**直接把 \`puts@got\` 改写为 \`system\` 的地址**！
- 紧接着程序执行普通的 \`puts("/bin/sh")\`，由于 CPU 是去翻看 GOT 表并跳转，结果直接跳去执行了 \`system("/bin/sh")\`，权限被瞬间窃取！这种手法叫 **GOT 劫持（GOT Hijack）**。

### 2. 追问底层：为什么操作系统允许黑客篡改 GOT 表？
**因为早期 Linux 为了“性能”，妥协了“安全”——采用了「延迟绑定 (Lazy Binding)」机制！**
- 思考一下：一个大型程序可能引用了几百个动态库函数，如果在开机启动时一个个去解析真实物理地址，程序启动会极其缓慢卡顿。
- 所以系统搞了延迟绑定：*“什么时候第一次调这个函数，动态链接器才去算真实地址并写回 GOT 表”*。
- **代价**：为了让动态链接器在程序跑起来之后还能往 GOT 表里填地址，操作系统就必须把 GOT 表所在的内存页设置为 **\`rw-\`（可读、可写！）**。
- 这块可写区域，成了挂在程序大门上毫无防备的“物理钥匙盒”。

### 3. RELRO 的铁腕制裁：Relocation Read-Only（重定位只读）
安全架构师痛定思痛：**能不能把这把钥匙盒彻底焊死？**
- 答案就是 **RELRO（重定位只读）**！
- 如果开启了 **Full RELRO**：
  1. 操作系统彻底放弃延迟绑定，改为 **BIND_NOW（立即全量绑定）**：程序刚启动的一瞬间，动态链接器加班加点，一口气把所有函数的真实地址全部查清填满；
  2. 填完之后，操作系统立刻调用内核系统调用 \`mprotect()\`，**将整个 GOT 表的内存权限从 \`rw-\` 永久降级为 \`r--\`（完全只读！）**！
  3. 从此，无论是合法代码还是黑客攻击，一旦任何人试图向 GOT 表写入 1 个比特，CPU MMU 硬件立刻当场触发硬件中断，报段错误（SIGSEGV）格杀勿论！

---

## 二、 经典靶场 C 源码与 3 种编译模式实测

为了直观观察 RELRO 的硬核防御效果，我们编写一个具备“任意地址写（Write-What-Where）”漏洞的靶场：

\`\`\`c
// 靶场源码：relro_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void win() {
    puts("HACKED! Shell successfully triggered!");
    system("/bin/sh");
}

void vuln() {
    unsigned long *target_addr;
    unsigned long target_val;
    
    puts("=== Arbitrary Memory Write Console ===");
    puts("Tell me WHERE to write (Target Address in Hex):");
    scanf("%lx", (unsigned long*)&target_addr);
    
    puts("Tell me WHAT to write (Target Value in Hex):");
    scanf("%lx", &target_val);
    
    // 致命漏洞：直接向任意指定的物理内存地址写入任意数据！
    printf("[*] Attempting to write 0x%lx to address %p ...\n", target_val, target_addr);
    *target_addr = target_val; // 核心触发点！
    
    puts("[+] Write succeeded! Now triggering puts again to execute hijack...");
}

int main() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
\`\`\`

---

## 三、 三大 RELRO 模式对比与 Checksec 深度透视

通过传递不同的 GCC 链接器参数（\`-Wl,-z,...\`），我们可以观察到三种完全不同的防御时代：

### 1. 远古时代：No RELRO
\`\`\`bash
gcc -Wl,-z,norelro -no-pie -m64 -o no_relro relro_demo.c
checksec ./no_relro
# 输出：RELRO: No RELRO
\`\`\`
- **物理状态**：\`.got\` 和 \`.got.plt\` 紧挨在全局数据段，**全线可读可写 (\`rw-\`)**。
- **实战结果**：输入 \`puts@got\` 的地址，写入 \`win\` 函数的地址。当代码走到 \`puts("[+] Write succeeded!...")\` 时，由于 \`puts@got\` 已经被换成了 \`win\`，**直接弹 Shell！GOT 劫持大获全胜！**

---

### 2. 过渡时代：Partial RELRO（部分开启，过去十年的默认配置）
\`\`\`bash
gcc -Wl,-z,relro -no-pie -m64 -o partial_relro relro_demo.c
checksec ./partial_relro
# 输出：RELRO: Partial RELRO
\`\`\`
- **物理状态**：链接器重新排布了 ELF 内部段的顺序，将 \`.init_array\`、\`.fini_array\` 和普通只读全局变量锁成了只读。
- **但留了致命后门**：负责外部函数动态延迟绑定的 **\`.got.plt\` 段依然是可写的 (\`rw-\`)**！
- **实战结果**：黑客依然可以直接改写 \`puts@got.plt\`，**依然能轻松完成 GOT 劫持！**

---

### 3. 现代铁壁：Full RELRO（最高安全防护，现代发行版标配）
\`\`\`bash
gcc -Wl,-z,relro,-z,now -no-pie -m64 -o full_relro relro_demo.c
checksec ./full_relro
# 输出：RELRO: Full RELRO
\`\`\`
- **物理状态**：
  1. 强制启用 \`-z,now\`（BIND_NOW），启动即解析完所有外部动态符号；
  2. \`.got.plt\` 合并进了 \`.got\`，整个 GOT 表被 \`mprotect\` **焊死为纯只读 (\`r--\`)**！
- **实战结果**：
  当我们在靶场中输入 \`puts@got\` 的地址试图写入时：
  \`\`\`text
  [*] Attempting to write 0x4011d6 to address 0x403fd8 ...
  Segmentation fault (core dumped)
  \`\`\`
  **CPU 硬件直接下发段错误自毁！GOT 劫持在物理层面被彻底粉碎封印！**

---

## 四、 物理内存段权限与防御能力对决表

| 防御级别 | 编译参数 | 符号绑定策略 | GOT 表内存属性 | 能否实施 GOT 劫持？ |
| :--- | :--- | :--- | :---: | :---: |
| **No RELRO** | \`-Wl,-z,norelro\` | 延迟绑定 (Lazy) | \`rw-\` (全表可写) | **可以**（极其脆弱） |
| **Partial RELRO** | \`-Wl,-z,relro\` | 延迟绑定 (Lazy) | \`.got.plt\` 为 \`rw-\` | **可以**（攻击点在 .got.plt） |
| **Full RELRO** | \`-Wl,-z,relro,-z,now\` | **立即绑定 (BIND_NOW)** | **\`r--\` (全表只读)** | **绝对不行**（写入即自爆） |

---

## 五、 攻防深水区：面对 Full RELRO，黑客怎么玩？

许多初学者遇到 \`Full RELRO\` 就认为“任意写”漏洞作废了，其实不然。顶级黑客会把武器转向其他仍然可写的核心命门：

### 1. 战法一：打栈上的返回地址（Return Address / ROP）
- GOT 表不能写，但**当前线程的栈空间（Stack）永远必须保持可写 (\`rw-\`)**，否则局部变量根本没法存！
- 把任意写的目标直接对准当前栈帧的 \`Saved RET\`，直接改写执行流走向 ROP 链！

### 2. 战法二：打 Glibc 内部的钩子函数（Hooks，低版本 glibc 杀手锏）
- 在 glibc 2.33 及更早版本中，C 语言库专门设计了调试钩子：
  - \`__malloc_hook\`：每次调用 malloc 前自动执行的函数指针；
  - \`__free_hook\`：每次调用 free 前自动执行的函数指针。
- **致命弱点**：哪怕目标开启了 Full RELRO，这些 Hooks 依然存放在 **libc.so 自身的可写数据段**中！黑客改不了程序的 GOT，但能改 libc 的 \`__free_hook\`，把其改成 \`system\`，紧接着触发 \`free("/bin/sh")\` 同样秒弹 Shell！

### 3. 战法三：打 _IO_FILE 虚表劫持（FSOP，现代 glibc 标配）
- 在高版本 glibc（2.34+ 移除了所有 Hooks）并且开了 Full RELRO 的绝境下，攻防进入终极阶段：黑客利用文件流结构体 \`FILE\`（如 \`stderr\`、\`_IO_list_all\`）中的虚函数表进行劫持，在程序调用 \`exit()\` 时完成借壳上市！这正是我们第 5 阶段将要攻坚的 FSOP！

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
| **2.3** | ASLR 与 ret2libc | 基址随机化、信息泄露反推 Base、GOT 劫持 | \`[v]\` | 两阶段 ROP：借 puts 打印 puts@got 破除 ASLR，跳回 main 实施二次打击 |
| **2.4** | **RELRO 约束机制** | **延迟绑定代价、BIND_NOW 与 GOT 物理只读封锁** | **\`[>]\`** | **当前攻坚：Partial (got.plt可写) vs Full (整表只读锁死，阻断 GOT 劫持)** |
| **2.5** | ret2csu 通用 Gadget | 缺乏指定寄存器零件时的 __libc_csu_init 万能传参 | \`[ ]\` | 待推进 |
| **2.6** | SROP 信号机制劫持 | sigreturn 系统调用一次性强控所有物理寄存器 | \`[ ]\` | 待推进 |

- **当前锚点**：节点 2.4（RELRO 约束机制：Partial 与 Full RELRO 对 GOT 覆写的硬性封锁）
- **下一推进方向**：吃透 RELRO 对内存写权限的封锁后，进入 64 位 ROP 传参的王牌通用大招 —— **2.5 ret2csu（万能通用 Gadget）**！

---

## 🎯 实验验证清单与思考题

1. **为什么说「Partial RELRO」防了个寂寞？它把 \\\`.got\\\` 锁成只读了，为什么黑客依然能够实施 GOT 劫持？黑客真正改的到底是哪个段？**
2. **在启用了「Full RELRO」的高防御程序中，虽然我们不能通过改写 GOT 表来劫持函数，但我们能否依然使用 \\\`puts(puts@got)\\\` 来泄露 libc 基址？（提示：只读权限（\\\`r--\\\`）是否妨碍“读取”？）**
`;

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf-8');
console.log('Successfully updated 2.4 courseware to masterclass quality!');
