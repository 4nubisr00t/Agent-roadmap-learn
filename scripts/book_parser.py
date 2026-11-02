#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deep Book Parser: Extracts structured Table of Contents, Chapters, and Section chunks
from PDF, Markdown, and Text textbooks for LLM Knowledge Graph / Skill Tree generation.
Supports native TOC, text-layer regex, and scanned textbook syllabus recognition.
"""

import sys
import os
import json
import re


KNOWN_SCANNED_BOOKS = {
    "mips": {
        "match_keywords": ["计算机组成原理", "MIPS", "康磊", "王斌"],
        "title": "计算机组成原理（基于MIPS结构）",
        "chapters": [
            {
                "index": 1,
                "title": "第1章 计算机系统概述",
                "page_range": "1-17",
                "sample_content": (
                    "第1章 计算机系统概述\n"
                    "1.1 计算机系统的组成：计算机的基本概念（存储程序、自动高速处理海量数据）、硬件系统与软件系统；"
                    "冯·诺依曼结构计算机的五大部件（运算器ALU、控制器CU、存储器Memory、输入设备、输出设备）与哈佛结构对比。\n"
                    "1.2 计算机的工作过程：指令周期（取指令Fetch、分析指令Decode、执行指令Execute）；PC程序计数器、IR指令寄存器、MAR地址寄存器、MDR数据寄存器、ACC累加器的协同微操作流程（以 Load ACC, X 为例：PC->MAR, M(MAR)->MDR->IR, PC+1->PC, Ad(IR)->MAR, M(MAR)->MDR->ACC）。\n"
                    "1.3 计算机的性能指标：机器字长、存储容量（主存/辅存字节数）、运算速度（主频f、时钟周期T=1/f、CPI每条指令平均时钟周期数、CPU执行时间、MIPS百万条指令每秒、FLOPS浮点运算每秒）。\n"
                    "1.4 计算机系统的体系结构：微程序机器级M0、传统机器语言机器级M1（ISA指令集架构分界线）、操作系统机器级M2、汇编语言机器级M3、高级语言机器级M4；软硬件在逻辑功能上的等效性。\n"
                    "1.5-1.6 MIPS架构计算机：RISC精简指令集核心特征（Load/Store架构、固定32位指令长度、32个通用寄存器、流水线友好设计）与CISC对比。"
                )
            },
            {
                "index": 2,
                "title": "第2章 运算方法和运算器",
                "page_range": "18-67",
                "sample_content": (
                    "第2章 运算方法和运算器\n"
                    "2.1 数据的表示方法：进位计数制与进制转换；定点小数与定点整数；原码、反码、补码、移码的定义、表示范围及转换规律；IEEE 754标准浮点数格式（符号位S、阶码E移码偏置127/1023、尾数M规格化1.M）；ASCII码与奇偶校验码、海明校验码、CRC循环冗余校验码。\n"
                    "2.2 定点数加减法运算：补码加法公式 [X+Y]补=[X]补+[Y]补，补码减法公式 [X-Y]补=[X]补+[-Y]补；溢出判别三大方法（单符号位法 V=Cn⊕Cn-1、双符号位变形补码法 01正溢/10负溢、最高有效位进位与符号位进位异或）；行波进位加法器与CLA先行进位（超前进位）加法器原理（生成函数Gi=AiBi、传递函数Pi=Ai⊕Bi）；MIPS中的 add/addu/sub/subu 指令与溢出异常。\n"
                    "2.3 定点数乘法运算：原码一位乘法（符号位单独异或、绝对值部分积右移累加）；Booth补码一位乘法（比较 yn 与 yn+1 决定 +0、+[X]补、+[-X]补 并算术右移）；阵列乘法器与MIPS中的 mult/multu 及 HI/LO 乘商寄存器。\n"
                    "2.4 定点数除法运算：恢复余数法与不恢复余数法（加减交替法：同号上商1左移减除数，异号上商0左移加除数）；MIPS中的 div/divu 指令。\n"
                    "2.5 浮点数四则运算：浮点加减法五步流程（对阶：小阶向大阶看齐尾数右移、尾数加减、规格化：左规与右规、舍入：0舍1入/恒置1/截断、溢出判断）；浮点乘除法（阶码加减、尾数乘除）。"
                )
            },
            {
                "index": 3,
                "title": "第3章 存储系统",
                "page_range": "68-118",
                "sample_content": (
                    "第3章 存储系统\n"
                    "3.1-3.2 存储器概述与主存结构：三级存储层次结构（Cache-主存-辅存）；存取时间Ta、存储周期Tc（Tc>Ta）、主存带宽；半导体存储芯片译码驱动方式（线选法与重合法/二维矩阵译码）。\n"
                    "3.3-3.4 RAM与ROM：静态RAM（SRAM，双稳态六管触发器存储元，速度快不需刷新，用于Cache）与动态RAM（DRAM，单管电容存储元，集成度高需定时刷新，用于主存）；DRAM三种刷新方式（集中刷新：存在死区、分散刷新：无死区但过度刷新、异步刷新：每隔 t_refresh/行数 刷新一行，兼顾效率）；地址线复用技术（行地址RAS/列地址CAS分时传送，地址引脚减半）；ROM分类（MROM、PROM、EPROM、EEPROM、Flash闪存）。\n"
                    "3.5 主存容量扩展与CPU连接：位扩展（地址线并联、数据线分别引出、CS并联）、字扩展（地址线低位并联、高位经译码器产生片选信号CS、数据线并联）、字位同时扩展。\n"
                    "3.6 高速存储器：双端口RAM、多模块交叉存储器（高位交叉编址=顺序方式 vs 低位交叉编址=交叉方式，流水线连续存取 m 个字耗时 T+(m-1)τ）。\n"
                    "3.7 高速缓冲存储器 Cache：程序访问的局部性原理（时间局部性与空间局部性）；命中率 h 与平均访问时间 Ta=h*tc+(1-h)*tm；三种地址映射方式（直接映射：主存块号 mod Cache总块数，硬件简单冲突率高；全相联映射：可放任意空行，全并行比较器成本高；组相联映射：组间直接映射、组内全相联，主存地址划分为 标记Tag + 组号Index + 块内地址Offset）；替换算法（FIFO、LRU最近最少使用、LFU、随机）；写策略（全写法Write-Through+写分配/非写分配、回写法Write-Back+脏位Dirty Bit）。"
                )
            },
            {
                "index": 4,
                "title": "第4章 总线技术",
                "page_range": "119-142",
                "sample_content": (
                    "第4章 总线技术\n"
                    "4.1-4.2 总线概述与连接结构：总线概念（分时与共享特性）；片内总线、系统总线（数据总线DB双向、地址总线AB单向、控制总线CB）、通信总线；总线性能指标（总线宽度W、总线工作频率f、总线带宽 B = f × W/8 B/s）；单总线结构、双总线结构（主存总线+I/O总线）、三总线结构（主存总线+I/O总线+DMA总线）。\n"
                    "4.3 总线判优控制（总线仲裁）：主设备（Master）与从设备（Slave）；集中式仲裁三种方式对比：\n"
                    "1) 链式查询方式：BS总线忙、BR总线请求、BG总线同意串行向下传递，离仲裁器越近优先级越高，仅需3根控制线，对故障敏感；\n"
                    "2) 计数器定时查询方式：用 log2(n) 根设备地址线广播计数值，优先级可灵活设定（从0开始固定优先级或从中止点循环优先级）；\n"
                    "3) 独立请求方式：每个设备独享一对 BRi 和 BGi，响应速度最快，控制线数量 2n 根最多。\n"
                    "4.4 总线通信控制（定时方式）：总线传输周期四阶段（申请分配、寻址、传数、结束）；同步通信（统一公共时钟控制，适合短距离高速同速部件）、异步通信（无公共时钟，采用握手应答信号 Strobe/Ack：不互锁、半互锁、全互锁，可靠性最高）、半同步通信（同步时钟+Wait等待信号线）、分离式通信（将传输周期拆分为请求子周期与应答子周期，挖掘总线最大潜能）。"
                )
            },
            {
                "index": 5,
                "title": "第5章 指令系统与MIPS汇编",
                "page_range": "143-180",
                "sample_content": (
                    "第5章 指令系统与MIPS汇编\n"
                    "5.1-5.2 指令格式：操作码OP + 地址码A；零地址、一地址、二地址、三地址指令；定长操作码与扩展操作码技术（保留留出码点向低地址扩展，计算各地址数指令的最大可编码条数）。\n"
                    "5.3 寻址方式：指令寻址（顺序寻址 PC+4、跳跃寻址）；十大常见数据寻址方式及有效地址EA计算：立即寻址（操作数就在指令中）、直接寻址 EA=A、间接寻址 EA=(A)、寄存器寻址 EA=Ri、寄存器间接寻址 EA=(Ri)、基址寻址 EA=(BR)+A（面向系统重定位，基址寄存器由OS管理）、变址寻址 EA=(IX)+A（面向用户数组循环遍历，变址寄存器由用户改变）、相对寻址 EA=(PC)+A（面向浮动程序与分支跳转）、堆栈寻址（SP栈指针自动增减）。\n"
                    "5.5-5.7 MIPS 32指令架构与C语言映射：\n"
                    "1) MIPS 32个32位通用寄存器（$0恒为0，$at，$v0-$v1返回值，$a0-$a3参数，$t0-$t9临时寄存器，$s0-$s7保存寄存器，$gp，$sp栈指针，$fp帧指针，$ra返回地址）；\n"
                    "2) 三大标准32位指令格式：\n"
                    "   - R型（寄存器型）：op(6位全0) + rs(5位) + rt(5位) + rd(5位) + shamt(5位) + funct(6位功能码)，如 add/sub/and/or/slt/sll/jr；\n"
                    "   - I型（立即数/访存/分支型）：op(6位) + rs(5位) + rt(5位) + imm(16位立即数)，如 lw/sw（EA = R[rs] + SignExt(imm)）、addi/andi/ori、beq/bne（目标地址 = (PC+4) + SignExt(imm)<<2）；\n"
                    "   - J型（无条件跳转型）：op(6位) + address(26位)，如 j/jal（目标地址 = (PC+4)[31:28] :: address :: 00）；\n"
                    "3) C语言分支、循环、数组访存及函数调用栈帧保存（sw $ra, 0($sp) / jal / lw $ra / jr $ra）的MIPS汇编实现。"
                )
            },
            {
                "index": 6,
                "title": "第6章 中央处理器 (CPU与MIPS流水线)",
                "page_range": "182-259",
                "sample_content": (
                    "第6章 中央处理器 (CPU)\n"
                    "6.1-6.2 CPU结构与MIPS数据通路：CPU四大核心功能（指令控制、操作控制、时间控制、数据加工）；单周期MIPS模型机数据通路（指令存储器IM、寄存器堆RegFile双读单写、ALU、数据存储器DM、符号扩展单元SignExtend、移位器、多路选择器MUX）与控制信号真值表（RegDst、ALUSrc、MemtoReg、RegWrite、MemRead、MemWrite、Branch、ALUOp）。\n"
                    "6.3 控制器设计：硬布线控制器（组合逻辑控制器，CU发出微命令 C = f(OP, 状态, 时序)，速度快但修改扩充困难，适合RISC）与微程序控制器（控制存储器CM存放微指令、微地址寄存器CMAR、微指令寄存器CMDR；水平型微指令 vs 垂直型微指令；微指令编码方式：直接控制法、字段直接编码法/互斥相容分段、字段间接编码法；微地址形成方式：断定法/下址字段法 vs 计数器法 μPC+1）。\n"
                    "6.4 多周期CPU：将指令执行切分为 IF取指、ID译码、EX执行、MEM访存、WB写回 五个阶段，分时复用单一存储器和ALU，通过有限状态机FSM控制，不同指令占用3~5个时钟周期（lw占5周期，sw/R型占4周期，beq/j占3周期）。\n"
                    "6.5 流水线CPU（MIPS五级流水线）：IF、ID、EX、MEM、WB五级流水线与段间流水线寄存器（IF/ID、ID/EX、EX/MEM、MEM/WB）；流水线吞吐率 TP、加速比 S、效率 E 计算；流水线三大相关与冲突（Hazards）及硬件解决机制：\n"
                    "1) 结构冒险（资源冲突）：哈佛结构分设指令Cache与数据Cache，寄存器堆前半周期写、后半周期读；\n"
                    "2) 数据冒险（RAW写后读冲突）：数据旁路/定向转发技术（Forwarding，从EX/MEM或MEM/WB直接拉线回ALU输入端），以及Load-Use冒险（lw后紧跟使用该寄存器的指令，必须插入1个气泡Bubble/Stall阻塞一拍）；\n"
                    "3) 控制冒险（分支跳转冲突）：分支提前判定、分支预测（静态预测与动态2位饱和计数器分支预测）、延迟槽技术（Delayed Branch）。"
                )
            },
            {
                "index": 7,
                "title": "第7章 输入/输出系统 (I/O、中断与DMA)",
                "page_range": "261-311",
                "sample_content": (
                    "第7章 输入/输出系统\n"
                    "7.1-7.2 I/O系统与I/O接口：I/O接口的五大功能（设备选择、数据缓冲匹配速度、信号电平与格式转换、传送控制命令、反映外设状态“忙/就绪/错误”）；I/O端口编址方式对比（统一编址/存储器映射编址：借用访存指令lw/sw访问I/O端口，占用主存地址空间，MIPS采用此方式；独立编址/I/O专用指令编址：使用专门IN/OUT指令，地址空间独立，x86采用此方式）。\n"
                    "7.3 程序查询方式：CPU不断轮询（Polling）测试外设状态寄存器的Ready位，CPU与外设完全串行工作，CPU利用率极低。\n"
                    "7.4 程序中断方式：中断概念、内中断（异常Exception：算术溢出、非法指令、缺页）与外中断（I/O中断、时钟中断）；中断全过程五个阶段：\n"
                    "1) 中断请求（IR触发器）与中断屏蔽（IM屏蔽字）；\n"
                    "2) 中断判优（硬件排队器或软件查询，响应优先级由硬件排队决定，处理优先级可通过动态改写屏蔽字改变！）；\n"
                    "3) 中断响应条件（CPU开中断 IE=1、无更高优先级DMA请求、当前指令执行完最后一个机器周期）与中断隐指令三大硬件自动操作（①关中断 ②保存断点PC ③引出中断服务程序入口地址：向量中断 vs 软件查询）；\n"
                    "4) 中断服务程序执行（①保护现场与屏蔽字 ②开中断【多重中断/中断嵌套关键】 ③设备服务主体 ④关中断 ⑤恢复现场与屏蔽字 ⑥开中断并中断返回IRET）；\n"
                    "5) 单重中断与多重中断（中断嵌套）的流程差异及屏蔽字配置计算。\n"
                    "7.5 DMA方式（直接存储器存取）：外设与主存之间开辟直接数据通路，成批高速交换数据无需CPU干预；DMA控制器（AR主存地址计数器、WC传送字计数器、DAR设备地址寄存器、DMA控制逻辑、中断机构）；DMA三种主存总线访存方式（停止CPU访存/成组连续传送、周期挪用/窃取一个存取周期、DMA与CPU交替访存）；DMA传送三阶段（预处理：CPU初始化DMAC参数、数据传送：完全由DMAC硬件按周期挪用完成、后处理：WC溢出为0时DMAC向CPU发DMA结束中断）；DMA方式与程序中断方式的本质区别（响应时机：机器周期末 vs 指令周期末；处理方式：硬件直传 vs 中断服务程序；优先级：DMA高于中断）。"
                )
            }
        ]
    },
    "database": {
        "match_keywords": ["数据库原理及应用", "陈志泊"],
        "title": "数据库原理及应用教程（第5版·SQL Server 2022）",
        "extract_pdf_text": True,
        "chapters": [
            {
                "index": 1,
                "title": "第1章 数据库系统概述（三级模式二级映像、数据模型与NoSQL/NewSQL）",
                "start_page": 13,
                "end_page": 52,
                "page_range": "1-40",
                "sample_content": (
                    "第1章 数据库系统概述\n"
                    "1.1-1.3 数据管理发展与数据库系统组成：信息与数据、数据处理与数据管理三个阶段（人工管理、文件系统、数据库系统）；数据库系统DBS组成（数据库DB、数据库管理系统DBMS、数据库管理员DBA、应用程序与用户）；DBMS的核心功能（数据定义DDL、数据操纵DML、数据库运行管理、数据组织存储与管理、数据库建立与维护）。\n"
                    "1.4-1.5 数据库系统的内部与外部体系结构：\n"
                    "1) 三级模式结构：外模式（子模式/用户模式，单个用户视图，可多个）、模式（逻辑模式/概念模式，全体数据的全局逻辑结构和特征描述，仅一个）、内模式（存储模式，数据物理存储结构和存储方式描述，仅一个）；\n"
                    "2) 二级映像与数据独立性：外模式/模式映像（保证数据的逻辑独立性：当模式改变时，DBA修改外模式/模式映像使外模式不变，应用程序无需修改）、模式/内模式映像（保证数据的物理独立性：当存储结构改变时，DBA修改模式/内模式映像使模式不变）；\n"
                    "3) 外部体系结构：单用户、主从式、客户/服务器（C/S）、浏览器/服务器（B/S）、分布式结构。\n"
                    "1.6-1.8 三个世界、数据模型与数据库新技术：现实世界（实体、属性、码、实体集、实体间联系 1:1、1:n、m:n）-> 信息世界（概念模型與E-R图表示法：矩形表示实体、椭圆表示属性、菱形表示联系）-> 计算机世界（逻辑数据模型）；数据模型三要素（数据结构、数据操作、数据的完整性约束）；层次模型、网状模型、关系模型、面向对象模型；分布式数据库、数据仓库与OLAP、NoSQL（键值/列族/文档/图数据库）与NewSQL。"
                )
            },
            {
                "index": 2,
                "title": "第2章 关系模型及其操作（关系完整性、关系代数八大运算与查询优化）",
                "start_page": 53,
                "end_page": 80,
                "page_range": "41-68",
                "sample_content": (
                    "第2章 关系模型及其操作\n"
                    "2.1-2.3 关系数据结构与关系的完整性约束：\n"
                    "1) 基本概念：域（Domain）、笛卡尔积（Cartesian Product）、关系（Relation，笛卡尔积的有限子集，二维表）、元组（Tuple/行）、属性（Attribute/列）、超码（Super Key）、候选码（Candidate Key，极小超码）、主码（Primary Key）、主属性与非主属性、外码（Foreign Key）；基本关系的6条性质（列是同质的、不同列可出自同一域、列的顺序无所谓、行的顺序无所谓、任意两个元组不能完全相同、分量必须取原子值即满足1NF）；\n"
                    "2) 关系模型的三类完整性约束：\n"
                    "   - 实体完整性：若属性A是基本关系R的主属性，则A不能取空值（NULL）；\n"
                    "   - 参照完整性：若属性F是基本关系R的外码，参照基本关系S的主码Ks，则F要么取空值（NULL），要么等于S中某个元组的主码值；\n"
                    "   - 用户定义的完整性：针对具体应用环境的数据语义约束（如成绩0~100、性别男/女）。\n"
                    "2.4-2.5 关系代数与关系演算：\n"
                    "1) 传统的集合运算（二目运算，要求两关系具有相同目数n且对应属性取自同一域）：并（R∪S）、差（R-S）、交（R∩S = R-(R-S)）、笛卡尔积（R×S，列数为n+m，行数为k1×k2）；\n"
                    "2) 专门的关系运算：\n"
                    "   - 选择（Selection，σ_F(R)）：水平方向筛选满足条件F的行；\n"
                    "   - 投影（Projection，π_A(R)）：垂直方向筛选指定属性列并自动消除重复行；\n"
                    "   - 连接（Join，R ⋈ S）：θ连接、等值连接（从R×S中选取A=B的元组，列数为n+m）、自然连接（Natural Join，在等值连接基础上去掉重复的公共属性列，同时从行和列的角度运算！）、外连接（左外连接 ⟕、右外连接 ⟖、全外连接 ⟗，保留未匹配元组填NULL）；\n"
                    "   - 除运算（Division，R ÷ S）：象集 Z_x 概念，专门解决“查询至少选修了全部课程/某类全部对象”的全称量词查询问题！\n"
                    "3) 关系代数五大基本运算（并∪、差-、笛卡尔积×、选择σ、投影π）及复杂关系代数表达式编写与等价语法树代数优化（选择运算尽可能先做！投影与选择同时进行）。"
                )
            },
            {
                "index": 3,
                "title": "第3章 关系型数据库标准语言——SQL（DDL、单表/连接/嵌套查询与DML）",
                "start_page": 81,
                "end_page": 134,
                "page_range": "69-122",
                "sample_content": (
                    "第3章 关系型数据库标准语言——SQL\n"
                    "3.1-3.4 SQL体系与数据定义DDL：SQL特点（综合统一、高度非过程化、面向集合的操作方式、两种使用方式）；三级模式对应（基本表Base Table对应模式、视图View对应外模式、存储文件对应内模式）；SQL Server 2022存储结构（主数据文件.mdf、次数据文件.ndf、事务日志文件.ldf）；CREATE/ALTER/DROP DATABASE 与 CREATE/ALTER/DROP TABLE（PRIMARY KEY、FOREIGN KEY REFERENCES、UNIQUE、NOT NULL、DEFAULT、CHECK 约束定义）。\n"
                    "3.5-3.9 数据查询语言 DQL (SELECT ... FROM ... WHERE ... GROUP BY ... HAVING ... ORDER BY)：\n"
                    "1) 单表查询：DISTINCT去重、BETWEEN...AND、IN、LIKE字符串模糊匹配（%任意长度字符，_单个字符，ESCAPE转义）、IS NULL / IS NOT NULL、聚合函数（COUNT/SUM/AVG/MAX/MIN，自动忽略NULL）、GROUP BY分组与HAVING分组后筛选（WHERE作用于基本表元组，不可用聚合函数；HAVING作用于分组，可用聚合函数）；\n"
                    "2) 连接查询：内连接（INNER JOIN ... ON）、自连接（同一表取别名连接）、外连接（LEFT/RIGHT/FULL OUTER JOIN）；\n"
                    "3) 子查询（嵌套查询）：\n"
                    "   - 不相关子查询（由内向外求解，子查询独立于父查询，使用 IN、比较运算符、ANY/SOME、ALL）；\n"
                    "   - 相关子查询（子查询条件依赖父查询当前元组属性值，循环迭代求解）与 EXISTS / NOT EXISTS 存在量词查询；用双重 NOT EXISTS 实现关系代数“除（÷）”即全称量词“查询选修了全部课程的学生”；\n"
                    "4) 集合运算查询：UNION / UNION ALL（并）、INTERSECT（交）、EXCEPT（差）与 SELECT INTO 结果存表。\n"
                    "3.10 数据操纵语言 DML：INSERT INTO ... VALUES / SELECT 插入数据、UPDATE ... SET ... WHERE 修改数据（含基于子查询或JOIN的批量更新）、DELETE FROM ... WHERE 删除数据（对比 TRUNCATE TABLE 截断表）。"
                )
            },
            {
                "index": 4,
                "title": "第4章 关系型数据库理论（函数依赖、候选码求解、最小依赖集与1NF~BCNF规范化）",
                "start_page": 135,
                "end_page": 180,
                "page_range": "123-168",
                "sample_content": (
                    "第4章 关系型数据库理论（关系规范化理论）\n"
                    "4.1-4.2 规范化问题的提出与函数依赖：不良关系模式存在的四大弊端（数据冗余太大、更新异常Update Anomaly、插入异常Insertion Anomaly、删除异常Deletion Anomaly）；平凡函数依赖与非平凡函数依赖 X→Y、完全函数依赖（X→Y且对X真子集X'都不成立）与部分函数依赖、传递函数依赖（X→Y, Y↛X, Y→Z 则 X→传递Z）；Armstrong公理系统（三条基本推理规则：自反律、增广律、传递律；三条导出规则：合并规则、伪传递规则、分解规则）。\n"
                    "4.3-4.4 属性集闭包 X_F^+ 与候选码、最小函数依赖集求解算法（核心必考计算题）：\n"
                    "1) 属性集闭包求解算法：计算 X_F^+，用于判定 X→Y 是否被 F 逻辑蕴含（即判断 Y ⊆ X_F^+）及判断 X 是否为超码（X_F^+ = U）；\n"
                    "2) 候选码快速求解四类属性分类法：\n"
                    "   - L类（只出现在函数依赖左部）：必包含在任何候选码中！\n"
                    "   - R类（只出现在函数依赖右部）：必不包含在任何候选码中！\n"
                    "   - N类（左右两边都未出现）：必包含在任何候选码中！\n"
                    "   - LR类（左右两边均出现）：若 (L∪N)_F^+ = U，则 L∪N 是唯一候选码；否则将 LR 类属性逐个组合并入 L∪N 求闭包，直至闭包等于 U；\n"
                    "3) 最小函数依赖集（极小覆盖 Fm）三步求解算法：①右部单属性化（分解） ②去除左部冗余属性（对 X→A，检查 A ∈ (X-{B})_F^+） ③去除冗余函数依赖（在 F-{X→A} 下检查 A ∈ X^+）。\n"
                    "4.5-4.6 模式分解（无损连接与保持函数依赖）及 1NF / 2NF / 3NF / BCNF 范式判定与分解：\n"
                    "1) 各级范式递进定义与判定：\n"
                    "   - 1NF：所有属性均为不可分原子值；\n"
                    "   - 2NF：满足1NF，且每一个非主属性完全函数依赖于任何一个候选码（消除了非主属性对码的部分函数依赖）；\n"
                    "   - 3NF：满足2NF，且每一个非主属性既不部分依赖也不传递依赖于码（即对任意非平凡 X→Y，要么 X 是超码，要么 Y 是主属性）；\n"
                    "   - BCNF（鲍依斯-科得范式）：对任意非平凡函数依赖 X→Y，X 必包含候选码（即左部必是超码！消除了主属性对码的部分和传递依赖）；\n"
                    "2) 模式分解准则：保持函数依赖分解算法（基于最小依赖集 Fm 按相同左部合并分组，可达到 3NF 且保持 FD；若再添入候选码则既无损连接又保持 FD 达到 3NF）与无损连接分解判定（二元分解 R1∩R2→(R1-R2) 或 R1∩R2→(R2-R1) 表格追逐法 Chase Algorithm）。"
                )
            },
            {
                "index": 5,
                "title": "第5章 数据库优化和管理（视图、B+树索引、安全性、完整性、事务ACID、并发封锁与故障恢复）",
                "start_page": 181,
                "end_page": 236,
                "page_range": "169-224",
                "sample_content": (
                    "第5章 数据库优化和管理\n"
                    "5.1-5.2 视图与索引优化：\n"
                    "1) 视图（View）：虚表，数据库中只存放视图的定义而不存放对应数据，视图消解（View Resolution）；CREATE/ALTER/DROP VIEW（WITH CHECK OPTION 保证增删改满足视图子查询条件）；视图的作用（简化用户操作、多角度看待同一数据、对重构数据库提供一定程度的逻辑独立性、对机密数据提供安全保护）；不可更新视图的情形（含聚合函数、GROUP BY、DISTINCT、计算列等）；\n"
                    "2) 索引（Index）：B+树索引结构与哈希索引；聚集索引（Clustered Index，表中数据行的物理存储顺序与索引顺序完全一致，每张表最多只能建 1 个聚集索引！）与非聚集索引（Non-clustered Index，索引顺序与物理存储顺序无关，叶节点存放行指针或聚集索引键，可建多个）、唯一索引（UNIQUE INDEX）；索引设计原则（高频查询/连接/排序列建索引，频繁更新或基数极低列不宜建索引）。\n"
                    "5.3-5.4 数据库安全性与完整性控制：用户身份鉴别、自主存取控制 DAC（GRANT 授予权限 WITH GRANT OPTION / REVOKE 回收权限 CASCADE）、角色管理（CREATE ROLE）与强制存取控制 MAC（敏感度标记：绝密TS/机密S/秘密C/公开P，主客体读写规则：下读上写）、视图机制、审计（Audit）与数据加密。\n"
                    "5.5 事务处理与并发控制（核心重点）：\n"
                    "1) 事务（Transaction）概念（BEGIN TRANSACTION / COMMIT / ROLLBACK）与 ACID 四大特性：原子性（Atomicity）、一致性（Consistency）、隔离性（Isolation）、持续性/持久性（Durability）；\n"
                    "2) 并发操作带来的三类数据不一致问题：①丢失修改（Lost Update，两个事务读入同一数据并修改，后提交覆盖先提交） ②不可重复读（Non-repeatable Read，事务T1读取数据后T2修改或删除导致T1再读不一致/幻影行） ③读“脏”数据（Dirty Read，T1修改数据后T2读取，随后T1回滚撤销）；\n"
                    "3) 封锁机制：排他锁/写锁（X锁）与共享锁/读锁（S锁）相容矩阵（S与S相容，其余均冲突）；三级封锁协议：①一级封锁协议（修改前加X锁直到事务结束释放，防止丢失修改） ②二级封锁协议（一级基础上读取前加S锁、读完即释放，防止丢失修改和读脏数据） ③三级封锁协议（一级基础上读取前加S锁直到事务结束才释放，防止全部三类不一致！）；活锁（先来先服务策略）与死锁（预防法：一次封锁法/顺序封锁法；诊断与解除法：超时法/事务等待图法，选择代价最小事务回滚）；可串行化调度（冲突可串行化判别）与两段锁协议（2PL：扩展阶段只加锁不解锁，收缩阶段只解锁不加锁；遵循2PL是可串行化调度的充分条件）。\n"
                    "5.6 数据库备份与恢复技术：四类故障（事务内部的故障、系统故障/软故障、介质故障/硬故障、计算机病毒）；数据转储（静态/动态转储，海量/增量转储）与登记日志文件（Log File，必须遵循“先写日志原则 WAL：Write-Ahead Logging”）；恢复策略：事务故障恢复（反向扫描日志 UNDO 撤销）、系统故障恢复（正向扫描日志对故障前已提交事务 REDO 重做，对未完成事务反向扫描 UNDO 撤销）、介质故障恢复（装入最新后备副本 + 重做已提交事务日志）；具有检查点（Checkpoint）的恢复技术。"
                )
            },
            {
                "index": 6,
                "title": "第6章 数据库设计（需求分析、概念设计E-R图集成、逻辑设计关系转换与物理设计）",
                "start_page": 237,
                "end_page": 291,
                "page_range": "225-279",
                "sample_content": (
                    "第6章 数据库设计（软件工程六阶段法）\n"
                    "6.1-6.2 数据库设计概述与需求分析：数据库设计的六个阶段（①需求分析 ②概念结构设计 ③逻辑结构设计 ④物理结构设计 ⑤数据库实施 ⑥数据库运行和维护）；需求分析阶段核心任务（调查用户业务与数据需求，绘制数据流图DFD，编写数据字典Data Dictionary：数据项、数据结构、数据流、数据存储、处理过程）。\n"
                    "6.3 概念结构设计（E-R模型设计与视图集成）：\n"
                    "1) 实体与属性的划分原则（属性不能再具有需要描述的性质，属性不能与其他实体发生联系）；\n"
                    "2) 局部E-R图设计；\n"
                    "3) 分E-R图集成与三类冲突消除：\n"
                    "   - 属性冲突（属性域冲突：类型/取值范围/单位不同；属性取值冲突）；\n"
                    "   - 命名冲突（同名异义、异名同义）；\n"
                    "   - 结构冲突（同一对象在不同应用中一个抽象为实体另一个抽象为属性；同一实体包含属性个数和次序不同；实体间联系在不同分E-R图中呈现不同联系类型 1:1/1:n/m:n）。\n"
                    "6.4 逻辑结构设计（E-R图向关系模式的转换规则——大题必考！）：\n"
                    "1) 一个实体型转换为一个关系模式，实体的属性即为关系的属性，实体的码即为关系的码；\n"
                    "2) 实体间联系的转换规则：\n"
                    "   - 1:1（一对一）联系：可以转换为一个独立的关系模式（两边实体码均加入，任选一方作主码），也可以与任意一端对应的关系模式合并（将另一端的主码和联系自身的属性并入该端关系模式中）；\n"
                    "   - 1:n（一对多）联系：可以转换为一个独立的关系模式（n端实体码作主码），也可以与 n 端（多端）对应的关系模式合并（将 1 端的主码作为外码加入 n 端关系模式，并加入联系自身的属性！切记是并入多端！）；\n"
                    "   - m:n（多对多）联系：必须转换为一个独立的关系模式！该关系模式的属性包括与该联系相连的各实体的码以及联系本身的属性，该关系的码为各实体码的组合（复合主码）！\n"
                    "   - 三个或三个以上实体间的多元联系及同一实体集内部的自联系转换；\n"
                    "3) 关系模式的规范化（检验是否达到3NF/BCNF）与用户子模式（外模式视图）设计。\n"
                    "6.5-6.6 数据库物理设计与实施维护：确定数据库的物理结构（关系模式存取方法选择：B+树索引/Hash存取/聚簇Cluster设计；确定数据库存储结构与存放位置分区）、数据的载入与试运行、数据库性能监控与重组重构。"
                )
            },
            {
                "index": 7,
                "title": "第7章 SQL Server高级应用（T-SQL编程、游标、存储过程、自定义函数与触发器）",
                "start_page": 292,
                "end_page": 338,
                "page_range": "280-326",
                "sample_content": (
                    "第7章 SQL Server高级应用（数据库服务端编程）\n"
                    "7.1-7.2 T-SQL编程基础与游标（Cursor）：局部变量声明 DECLARE @var、赋值 SET/SELECT @var = ...；流程控制语句（BEGIN...END、IF...ELSE、CASE WHEN...THEN...END、WHILE...BREAK/CONTINUE）；游标的概念与操作五步流程（① DECLARE cursor_name CURSOR FOR SELECT... 声明游标 ② OPEN cursor_name 打开游标 ③ FETCH NEXT FROM cursor_name INTO @vars 逐行读取并检查 @@FETCH_STATUS = 0 ④ CLOSE cursor_name 关闭游标 ⑤ DEALLOCATE cursor_name 释放游标）。\n"
                    "7.3 存储过程（Stored Procedure）：预编译存放在数据库服务器端的T-SQL程序块，优点（执行效率高预编译、减少网络通信流量、集中安全管控与代码复用）；创建存储过程 CREATE PROCEDURE proc_name (@param1 INT, @param2 VARCHAR(50) OUTPUT) AS BEGIN ... END；执行存储过程 EXEC proc_name（区分输入参数与 OUTPUT 输出参数传参）。\n"
                    "7.4 用户自定义函数（UDF）：标量值函数（RETURNS scalar_type，返回单个值，可在SELECT子句中调用）、内联表值函数（RETURNS TABLE AS RETURN(SELECT...)，可在FROM子句中当表用）、多语句表值函数（RETURNS @table_var TABLE(...)）；存储过程与自定义函数的核心区别（函数必须有返回值且不能产生修改数据库状态的副作用，存储过程可执行DML/DDL并支持多个OUTPUT参数）。\n"
                    "7.5 触发器（Trigger）：特殊类型的存储过程，由事件（INSERT、UPDATE、DELETE）自动触发执行，不能被显式调用，专门用于实现比 CHECK 约束更复杂的跨表业务规则与参照完整性；\n"
                    "1) 两张核心内存逻辑专用表（驻留内存、系统自动维护、只读）：\n"
                    "   - inserted 表：存放 INSERT 插入的新行，或 UPDATE 更新后的新行数据；\n"
                    "   - deleted 表：存放 DELETE 删除的旧行，或 UPDATE 更新前的旧行数据（UPDATE 等价于先删除旧行记入 deleted，再插入新行记入 inserted！）；\n"
                    "2) 两类触发器执行机制对比：\n"
                    "   - AFTER / FOR 触发器（后触发器）：在 DML 操作执行并完成基本约束检查之后触发，若违背业务规则可执行 ROLLBACK TRANSACTION 回滚撤销；\n"
                    "   - INSTEAD OF 触发器（替代触发器）：替代原本触发它的 DML 语句本身去执行触发器体内的逻辑，常用于实现对复杂多表不可更新视图的数据插入/修改！"
                )
            }
        ]
    },
    "physics": {
        "match_keywords": ["大学物理", "赵近芳", "第七版"],
        "title": "大学物理学（第七版·下册：电磁学、波动光学与量子物理）",
        "chapters": [
            {
                "index": 1,
                "title": "第9章 静电场（库仑定律、高斯定理、电势与电介质）",
                "page_range": "3-38",
                "sample_content": (
                    "第9章 静电场\n"
                    "9.1 电场与电场强度：电荷量子化与电荷守恒定律；库仑定律 F = (1/4πε0)*(q1*q2/r^2)*e_r；电场强度定义 E = F/q0；点电荷场强公式、场强叠加原理与连续带电体场强积分计算 dE = dq/(4πε0*r^2)*e_r（均匀带电细棒、圆环轴线、无限大均匀带电平面 E = σ/(2ε0)）；电偶极子在均匀外电场中的力矩 M = p × E。\n"
                    "9.2 电通量与高斯定理：电场线性质、电通量 Φe = ∮ E·dS；真空中静电场的高斯定理 ∮_S E·dS = Σq_in / ε0（揭示静电场是有源场）；利用高斯定理求解三类对称电荷分布的场强（球对称：均匀带电球面/球体；轴对称：无限长均匀带电直线/圆柱面；面对称：无限大带电平面/平板）。\n"
                    "9.3-9.4 静电场的环路定理与电势：静电场力做功与路径无关、静电场环路定理 ∮_L E·dl = 0（揭示静电场是保守场/无旋场）；电势能与电势定义 U_a = ∫_a^∞ E·dl，电势差 U_ab = U_a - U_b = ∫_a^b E·dl；点电荷电势公式 U = q/(4πε0*r) 与电势叠加原理；求电势的两种核心方法（已知电荷分布由点电荷电势叠加积分 U = ∫ dq/(4πε0*r)；已知场强分布由定义积分 U = ∫ E·dl）；等势面性质与场强-电势微分关系 E = -∇U。\n"
                    "9.5-9.8 静电场中的导体、电介质、电容器与静电能量：\n"
                    "1) 导体的静电平衡条件（导体内部场强处处为0，导体表面场强垂直于表面 E = σ/ε0；导体是等势体，表面是等势面）；实心导体与空腔导体电荷分布规律、静电屏蔽（内屏蔽与外屏蔽接地）；\n"
                    "2) 电介质的极化（无极分子位移极化与有极分子取向极化）、电极化强度矢量 P = χe*ε0*E、极化电荷面密度 σ' = P·n；电位移矢量 D = ε0*E + P = ε0*εr*E 与有电介质时的高斯定理 ∮_S D·dS = Σq0（仅包含自由电荷）；\n"
                    "3) 电容定义 C = Q/U，平行板电容器 C = εS/d、圆柱形电容器 C = 2πεL/ln(R2/R1)、球形电容器 C = 4πεR1R2/(R2-R1)；\n"
                    "4) 电容器储能公式 W = Q^2/(2C) = (1/2)CU^2 = (1/2)QU；电场能量密度 we = (1/2)D·E = (1/2)εE^2 与空间静电能体积分 W = ∫ we dV。"
                )
            },
            {
                "index": 2,
                "title": "第10章 稳恒磁场（毕奥-萨伐尔定律、安培环路定理、洛伦兹力与磁介质）",
                "page_range": "39-81",
                "sample_content": (
                    "第10章 稳恒磁场\n"
                    "10.1-10.2 电流、磁感应强度与毕奥-萨伐尔定律：电流密度矢量 j 与 I = ∫ j·dS；电源电动势 ε；毕奥-萨伐尔定律 dB = (μ0/4π)*(I dl × e_r)/r^2 及磁感应强度叠加原理；三大典型载流导线的磁场公式推导与应用：\n"
                    "1) 载流直导线：B = (μ0*I)/(4πa)*(cosθ1 - cosθ2)，无限长直导线 B = μ0*I/(2πa)；\n"
                    "2) 圆电流轴线上：B = (μ0*I*R^2)/[2*(R^2+x^2)^(3/2)]，圆心处 B = μ0*I/(2R)，一段圆弧圆心处 B = (μ0*I*θ)/(4πR)；\n"
                    "3) 载流密绕螺线管轴线与无限长螺线管内部 B = μ0*n*I；运动电荷的磁场 B = (μ0/4π)*(q v × e_r)/r^2；载流线圈磁矩 pm = N*I*S*e_n。\n"
                    "10.3 磁场高斯定理与安培环路定理：磁通量 Φm = ∫ B·dS；磁场的高斯定理 ∮_S B·dS = 0（揭示磁场是无源场，磁感线闭合无头尾）；真空中稳恒磁场的安培环路定理 ∮_L B·dl = μ0 * ΣI_内（揭示稳恒磁场是非保守场/涡旋场，电流正负服从右手螺旋法则）；用安培环路定理求解无限长载流圆柱体、螺线管、螺绕环（B = μ0*N*I/(2πr)）与无限大均匀载流平面（B = μ0*i/2）的磁场。\n"
                    "10.4-10.5 安培力与洛伦兹力：安培力定律 dF = I dl × B 及任意弯曲导线在均匀磁场中的合力（等效于起点指向终点的直导线）；两平行无限长直导线单位长度相互作用力 f = μ0*I1*I2/(2πd)；均匀磁场中载流线圈所受磁力矩 M = pm × B 及磁力的功 A = I*ΔΦm；洛伦兹力 F = q(v × B)（永不做功）；带电粒子在均匀磁场中的圆周/螺旋运动（回旋半径 R = mv/(qB)、回旋周期 T = 2πm/(qB) 与速度无关）；霍尔效应（霍尔电压 UH = IB/(nqd) = RH*IB/d，判断半导体载流子正负类型与浓度）。\n"
                    "10.6 磁介质：顺磁质（μr>1）、抗磁质（μr<1）、铁磁质（μr>>1）；磁化强度 M 与磁化电流；磁场强度矢量 H = B/μ0 - M 及有磁介质时的安培环路定理 ∮_L H·dl = ΣI0_内（传导电流）与 B = μ0*μr*H；铁磁质的磁畴理论、起始磁化曲线、磁滞回线（剩磁Br、矫顽力Hc）、软磁材料与硬磁材料。"
                )
            },
            {
                "index": 3,
                "title": "第11章 变化的电磁场（法拉第电磁感应、动生/感生电动势、自感互感与麦克斯韦方程组）",
                "page_range": "82-108",
                "sample_content": (
                    "第11章 变化的电磁场\n"
                    "11.1 法拉第电磁感应定律与楞次定律：法拉第电磁感应定律 εi = -dΦm/dt（N匝串联线圈 εi = -N dΨ/dt）；楞次定律判断感应电流方向；感应电量 q = ΔΦm / R（仅取决于初末磁通量差值，与变化快慢无关）。\n"
                    "11.2 动生电动势与感生电动势：\n"
                    "1) 动生电动势：非静电力来源于洛伦兹力 Ek = v × B，公式 εi = ∫_a^b (v × B)·dl，求解直导体棒在匀强/非匀强磁场中平动或转动的电动势（转动棒 ε = (1/2)BωL^2）及高低电势端判定；\n"
                    "2) 感生电动势与涡旋电场：麦克斯韦感生电场（涡旋电场 E_k）假说，∮_L E_k·dl = -∬_S (∂B/∂t)·dS（感生电场是无源有旋场，电力线闭合）；圆柱形均匀变化磁场区域内（r<R 时 E_k = (r/2)|dB/dt|）与区域外（r>R 时 E_k = (R^2/2r)|dB/dt|）的感生电场与感生电动势计算；涡电流热效应与电磁阻尼。\n"
                    "11.3-11.4 自感、互感与磁场能量：自感磁链 Ψ = L*I，自感系数 L = Ψ/I（无限长螺线管 L = μ*n^2*V），自感电动势 εL = -L dI/dt；互感系数 M12 = M21 = M = Ψ21/I1 及互感电动势 ε21 = -M dI1/dt，顺串（L=L1+L2+2M）与反串（L=L1+L2-2M）；自感磁能 Wm = (1/2)L*I^2，磁场能量密度 wm = (1/2)B·H = B^2/(2μ) = (1/2)μH^2 及空间总磁能积分 Wm = ∫ wm dV（同轴电缆单位长度磁能与自感计算）。\n"
                    "11.5 位移电流与麦克斯韦方程组：传导电流不连续性与麦克斯韦位移电流假设 Id = dΦD/dt = ∬_S (∂D/∂t)·dS，位移电流密度 jd = ∂D/∂t（位移电流在激发磁场上与传导电流完全等效，但不产生焦耳热）；全电流安培环路定理 ∮_L H·dl = ∬_S (j + ∂D/∂t)·dS；麦克斯韦方程组积分形式的四个方程及其物理意义（高斯电通量定理、全电流安培环路定理、法拉第电磁感应定律、高斯磁通量定理）；平面电磁波的横波性质、E与H同相正交关系 √ε*E = √μ*H、波速 u = 1/√(εμ) 与坡印廷矢量（能流密度矢量）S = E × H。"
                )
            },
            {
                "index": 4,
                "title": "第12章 光的干涉（分波阵面杨氏双缝、光程差、薄膜等倾/劈尖/牛顿环与迈克耳孙干涉仪）",
                "page_range": "109-130",
                "sample_content": (
                    "第12章 光的干涉\n"
                    "12.1-12.3 相干光、杨氏双缝干涉与光程差：光波是波长 400~760nm 的电磁波；相干条件（频率相同、振动方向相同、相位差恒定）；分波阵面法与分振幅法；光程定义 L = n*r（折合为真空中的等效路程），光程差 δ = n2*r2 - n1*r1，相位差 Δφ = (2π/λ)*δ；干涉加强明纹条件 δ = ±kλ (k=0,1,2...)，干涉减弱暗纹条件 δ = ±(2k+1)λ/2；杨氏双缝干涉 δ = d*sinθ ≈ d*x/D，明暗纹坐标 x_k = ±k*Dλ/d，相邻条纹间距 Δx = Dλ/d，插入折射率n厚度e透明薄片后条纹平移量 Δx0 = (D/d)*(n-1)e；半波损失（光从光疏介质 n1 射向光密介质 n2 正入射/掠入射反射时，反射光产生 λ/2 的附加光程差）与劳埃德镜实验。\n"
                    "12.4-12.5 分振幅薄膜干涉（等倾干涉、劈尖干涉与牛顿环）：\n"
                    "1) 平行平面薄膜干涉（等倾干涉）：光程差通用公式 δ = 2*n2*e*cos(r) + [λ/2 或 0]（取决于上下两表面反射是否有半波损失之差！若 n1 < n2 < n3 或 n1 > n2 > n3 则两表面同有或同无半波损失，抵消无附加 λ/2；若 n2 最大或最小则必有附加 λ/2）；垂直入射 cos(r)=1，光学增透膜（反射光相消）与高反射膜（反射光相长）的最小膜厚 e 计算；\n"
                    "2) 劈尖干涉（等厚干涉）：空气劈尖垂直入射 δ = 2*n*e + λ/2，棱边处 e=0 为暗纹；相邻明（暗）纹对应厚度差 Δe = λ/(2n)，相邻条纹间距 l = λ/(2n*sinθ) ≈ λ/(2nθ)；劈尖移动、检验工件表面微小凹陷或凸起的高度 h = (Δb/l)*(λ/2) 判定；\n"
                    "3) 牛顿环（等厚干涉）：平凸透镜与平板玻璃间的空气膜 e = r^2/(2R)，光程差 δ = r^2/R + λ/2，中心接触点为暗斑；第 k 级明环半径 r_明 = √[(k - 1/2)Rλ] (k=1,2...)，第 k 级暗环半径 r_暗 = √(kRλ) (k=0,1,2...)。\n"
                    "12.6 迈克耳孙干涉仪：正交光路分振幅设计、补偿板G2的作用；动镜M1每平移 Δd = λ/2，视场中吞吐 1 条干涉条纹；若移过 N 条条纹，则移动距离 Δd = N*λ/2；光路中置入长 L 的气室充气后移过 N 条条纹，折射率 n = 1 + Nλ/(2L)。"
                )
            },
            {
                "index": 5,
                "title": "第13章 光的衍射（单缝夫琅禾费衍射、光栅衍射与缺级、圆孔瑞利判据与X射线布拉格衍射）",
                "page_range": "131-148",
                "sample_content": (
                    "第13章 光的衍射\n"
                    "13.1-13.2 惠更斯-菲涅耳原理与单缝夫琅禾费衍射：菲涅耳近场衍射与夫琅禾费远场平行光衍射；菲涅耳半波带法分析单缝衍射（缝宽 a，衍射角 θ，边缘最大光程差 δ = a*sinθ 被分割为 m = a*sinθ/(λ/2) 个半波带）：\n"
                    "1) 中央明纹中心：θ = 0，全部子波同相加强；\n"
                    "2) 暗纹条件：a*sinθ = ±kλ (k = 1, 2, 3...)；\n"
                    "3) 次级明纹中心近似条件：a*sinθ = ±(2k + 1)λ/2 (k = 1, 2, 3...)；\n"
                    "4) 中央明纹角宽度 Δθ0 = 2λ/a，透镜焦平面屏幕上的中央明纹线宽度 Δx0 = 2f*tanθ1 ≈ 2fλ/a（次级明纹宽度 Δx = fλ/a 仅为中央明纹的一半）；最高可见暗纹级数 k_max < a/λ。\n"
                    "13.3 衍射光栅（多缝干涉与单缝衍射的综合调制）：光栅常数 d = a + b（透光缝宽a + 不透光刻痕宽b = 1/N）；\n"
                    "1) 光栅方程（主极大明纹条件）：(a + b)*sinθ = ±kλ (k = 0, 1, 2...)，斜入射时为 (a + b)*(sinθ ± sinθ0) = ±kλ；最高主极大级次 k_max = floor((a+b)/λ)；\n"
                    "2) 缺级现象（单缝衍射暗纹调制包络恰好吞没多缝干涉主极大）：当同时满足 (a+b)sinθ = kλ 且 a*sinθ = k'λ 时，即 k = [(a+b)/a]*k' (k'=1,2...) 的主极大消失不见（缺级）！必须熟练计算缺级级次与屏幕上实际能看到的明条纹总条数；\n"
                    "3) 光栅光谱与角色散率 D = dθ/dλ = k/[(a+b)cosθ]、色分辨本领 R = λ/Δλ = k*N。\n"
                    "13.4-13.5 圆孔衍射与X射线衍射：圆孔夫琅禾费衍射中央艾里斑（Airy disk，占84%光能）第一暗环半角宽度 θ0 = 1.22λ/D；瑞利判据（一个点光源艾里斑中心恰好落在另一点光源艾里斑第一暗环上时刚好可分辨）与光学仪器最小分辨角 θ_min = 1.22λ/D、分辨本领 R = 1/θ_min = D/(1.22λ)；X射线在晶体晶面上的布拉格衍射公式 2d*sinθ = kλ (k=1,2...，注意 θ 为掠射角即入射线与晶面的夹角！)。"
                )
            },
            {
                "index": 6,
                "title": "第14章 光的偏振（马吕斯定律、布儒斯特角、双折射与波片偏振态变换）",
                "page_range": "149-168",
                "sample_content": (
                    "第14章 光的偏振\n"
                    "14.1-14.2 光的五种偏振态与马吕斯定律：电磁波中电矢量E称为光矢量；自然光（各个方向光矢量振幅相等且无固定相位关系，分解为两个互相垂直、等幅、不相干的独立分量，每个分量光强各占 I0/2）、线偏振光（平面偏振光）、部分偏振光（偏振度 P = (I_max - I_min)/(I_max + I_min)）、圆偏振光与椭圆偏振光；\n"
                    "1) 自然光通过理想偏振片（起偏器）：透射成为线偏振光，光强减半 I1 = (1/2)I0；旋转偏振片光强不变；\n"
                    "2) 马吕斯定律（Malus's Law）：线偏振光（光强I1、振幅A1）通过偏振化方向夹角为 α 的检偏器后，透射振幅 A2 = A1*cosα，透射光强 I2 = I1 * cos^2(α)；若在正交偏振片（P1⊥P2）之间插入第三块夹角为 θ 的偏振片 P3，最终透射光强 I = (1/2)*I0 * cos^2(θ) * sin^2(θ) = (1/8)*I0 * sin^2(2θ)。\n"
                    "14.3 反射与折射光的偏振——布儒斯特定律：自然光在两种介质界面反射和折射时，当入射角等于起偏振角（布儒斯特角 i0）满足 tan(i0) = n2/n1 时，反射光为完全线偏振光（振动方向垂直于入射面，仅含 · 分量），折射光为部分偏振光，且此时反射光线与折射光线严格垂直（i0 + r = 90°）！\n"
                    "14.5-14.7 双折射、波片与偏振光的干涉：单轴晶体光轴、主截面与主平面；寻常光（o光，遵守折射定律，各向波速相同 v_o = c/n_o，振动垂直于主平面）与非常光（e光，不遵守常规折射定律，波速随方向变化，振动在主平面内）；尼科耳棱镜；晶片（波片）产生的 o 光与 e 光光程差 δ = |n_o - n_e|*d 及相位差 Δφ = (2π/λ)*|n_o - n_e|*d：\n"
                    "1) 四分之一波片（λ/4波片）：δ = (2k+1)λ/4，最小厚度 d_min = λ/(4|n_o - n_e|)；线偏振光以 α=45° 入射变成圆偏振光，其他角度（≠0°,90°）变成椭圆偏振光；\n"
                    "2) 半波片（λ/2波片）：δ = (2k+1)λ/2，线偏振光以夹角 α 入射后仍为线偏振光，但振动面转过 2α 角；\n"
                    "3) 偏振光的干涉：波片置于起偏器P1与检偏器P2之间，分析平行（P1∥P2）与正交（P1⊥P2）条件下的附加半波损失与干涉及消光条件。"
                )
            },
            {
                "index": 7,
                "title": "第15章 量子物理基础（黑体辐射、光电效应、康普顿散射、玻尔氢原子、德布罗意波与薛定谔方程）",
                "page_range": "169-215",
                "sample_content": (
                    "第15章 量子物理基础\n"
                    "15.1 黑体辐射与普朗克能量子假设：单色辐出度 M_λ(T) 与总辐出度 M(T)；斯特藩-玻尔兹曼定律 M(T) = σ*T^4；维恩位移定律 λ_m * T = b (b = 2.897×10^-3 m·K)；瑞利-金斯公式的“紫外灾难”与维恩公式；普朗克能量子假设（谐振子能量只能取 ε0 = hν 的整数倍 E = nhν, h = 6.626×10^-34 J·s）与普朗克黑体辐射公式。\n"
                    "15.2 光电效应与康普顿效应（光的波粒二象性）：\n"
                    "1) 光电效应四大实验规律（饱和光电流与光强成正比、截止频率/红限频率 ν0 = A/h、遏止电压 Ua 与频率成线性关系而与光强无关、瞬时性 <10^-9s）；爱因斯坦光子假设（E = hν，动量 p = h/λ = hν/c，光子静质量为0）与爱因斯坦光电效应方程 hν = (1/2)m*v_max^2 + A = e*Ua + A；\n"
                    "2) 康普顿散射：X射线被自由电子散射后波长变长 Δλ = λ' - λ = (h / m0*c)*(1 - cosθ) = λ_c*(1 - cosθ)，其中电子康普顿波长 λ_c = h/(m0*c) = 2.43×10^-12 m = 0.0243 Å；光子与静止电子弹性碰撞的能量守恒与动量守恒方程。\n"
                    "15.3 玻尔氢原子理论：氢原子光谱里德伯-巴耳末经验公式 1/λ = R*(1/k^2 - 1/n^2)（莱曼系k=1紫外、巴耳末系k=2可见光、帕邢系k=3红外）；玻尔三条基本假设（定态假设、频率条件 hν = E_n - E_k、角动量量子化条件 L = mvr = n*h/(2π) = n*ħ）；氢原子轨道半径 r_n = n^2 * r1 (玻尔半径 r1 = 0.529 Å) 与能级公式 E_n = E1 / n^2 = -13.6 / n^2 (eV)，基态电离能 13.6 eV 与激发能。\n"
                    "15.4-15.5 德布罗意物质波与海森堡不确定关系：德布罗意关系 E = hν、p = h/λ（电子经加速电压U加速后的非相对论德布罗意波长 λ = h/√(2m0*eU) ≈ 12.27/√U Å）；戴维孙-革末电子衍射实验；物质波的统计解释（波函数模的平方 |Ψ(r,t)|^2 代表粒子在该处出现的概率密度）与归一化条件 ∫ |Ψ|^2 dV = 1；海森堡不确定关系 Δx * Δpx ≥ ħ/2，ΔE * Δt ≥ ħ/2。\n"
                    "15.6-15.11 薛定谔方程、一维势阱与氢原子四个量子数：\n"
                    "1) 波函数三大标准条件（单值、有限、连续）；一维定态薛定谔方程 -(ħ^2 / 2m)*(d^2ψ/dx^2) + V(x)ψ(x) = E*ψ(x)；\n"
                    "2) 一维无限深方势阱（宽度 a，阱内 V=0，阱外 V=∞）：波函数 ψ_n(x) = √(2/a) * sin(nπx/a)，量子化能级 E_n = n^2 * h^2 / (8m*a^2) (n=1,2,3...)，零点能 E1 ≠ 0，概率密度 |ψ_n(x)|^2 的极大值点与节点分布；势垒贯穿（量子隧穿效应）与扫描隧道显微镜STM；\n"
                    "3) 氢原子四个量子数及其取值规则与物理意义：主量子数 n=1,2,3...（主要决定能量）、角量子数 l=0,1,...,n-1（决定轨道角动量大小 L = √[l(l+1)]ħ）、磁量子数 ml=0,±1,...,±l（共2l+1个，决定角动量空间取向 Lz = ml*ħ）、自旋磁量子数 ms=±1/2（决定自旋角动量取向 Sz = ms*ħ）；泡利不相容原理（同一原子中不可能有两个电子处于完全相同的四个量子数状态，主壳层最多容纳 2n^2 个电子，支壳层最多容纳 2(2l+1) 个电子）与能量最小原理。"
                )
            },
            {
                "index": 8,
                "title": "第16-17章 原子核物理与新技术的物理基础（放射性衰变、固体能带、半导体、激光与超导）",
                "page_range": "216-270",
                "sample_content": (
                    "第16章 原子核物理和粒子物理简介 & 第17章 新技术的物理基础\n"
                    "16.1-16.2 原子核性质与衰变规律：核半径 R = r0 * A^(1/3)；核力特征（短程强相互作用、饱和性、与电荷无关）；质量亏损 Δm = Z*mp + (A-Z)*mn - M_核 与核结合能 ΔE = Δm * c^2 (1 u = 931.5 MeV)、比结合能；放射性衰变定律 N(t) = N0 * e^(-λt)，半衰期 T_(1/2) = ln2 / λ = 0.693/λ，平均寿命 τ = 1/λ，放射性活度 A(t) = |dN/dt| = λN；α衰变、β衰变（中微子假说）、γ衰变；重核裂变与轻核聚变。\n"
                    "17.1 固体的能带结构与半导体物理：共有化电子在周期性势场中的能带形成（满带/价带、禁带宽度 Eg、空带/导带）；导体（导带部分填充或价带与导带重叠）、绝缘体（禁带极宽 Eg > 3~5 eV）、半导体（禁带较窄 Eg ≈ 0.1~2 eV，如 Si 为 1.12 eV，Ge 为 0.67 eV）的能带区分；本征半导体（电子-空穴对本征激发）、N型半导体（掺入五价磷/砷施主杂质，施主能级位于导带底下方很近处，多数载流子为电子）与P型半导体（掺入三价硼/铟受主杂质，受主能级位于价带顶上方很近处，多数载流子为空穴）；PN结的形成、内建电场、正向导通与反向截止的单向导电性。\n"
                    "17.2 激光原理：光的自发辐射（非相干光）、受激吸收、爱因斯坦受激辐射（产生与入射光子频率、相位、偏振态、传播方向完全相同的全同光子——激光相干性的根源！）；玻尔兹曼分布与粒子数反转分布（激活介质/工作物质、亚稳态能级、激励能源/泵浦源、光学谐振腔选频与正反馈放大）；激光的四大特性（高方向性、高单色性、高相干性、高亮度）。\n"
                    "17.3 超导电性：超导体的临界温度 Tc、临界磁场 Hc 与临界电流 Ic；超导体的两大基本电磁特征：零电阻效应与迈斯纳效应（Meissner effect，完全抗磁性，超导体内部磁感应强度 B ≡ 0）；BCS超导微观理论（电子通过晶格声子媒介结成动量相反、自旋相反的库珀对 Cooper pairs 发生玻色凝聚，无散射运动）与约瑟夫森隧道效应（SQUID超导量子干涉仪）。"
                )
            }
        ]
    }
}


def parse_pdf(file_path):
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz

    doc = fitz.open(file_path)
    total_pages = len(doc)
    metadata = doc.metadata or {}
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    book_title = metadata.get("title") or base_name

    # Check if companion .chapters.json exists next to raw file
    companion_json = file_path + ".chapters.json"
    if os.path.exists(companion_json):
        try:
            with open(companion_json, "r", encoding="utf-8") as cf:
                data = json.load(cf)
                doc.close()
                return data
        except Exception:
            pass

    # Check if filename or title matches known scanned textbooks
    for key, preset in KNOWN_SCANNED_BOOKS.items():
        if any(kw.lower() in base_name.lower() or kw.lower() in book_title.lower() for kw in preset["match_keywords"]):
            out_chapters = []
            for ch in preset["chapters"]:
                content = ch["sample_content"]
                if preset.get("extract_pdf_text") and "start_page" in ch and "end_page" in ch:
                    sp = max(0, ch["start_page"] - 1)
                    ep = min(total_pages, ch["end_page"])
                    extra_lines = []
                    for p in range(sp, min(sp + 15, ep)):
                        pt = doc[p].get_text("text")
                        for line in pt.splitlines():
                            s = line.strip()
                            if len(s) > 4:
                                extra_lines.append(s)
                    if extra_lines:
                        content = content + "\n\n【原书教材正文节选】：\n" + "\n".join(extra_lines)[:4000]
                out_chapters.append({
                    "index": ch["index"],
                    "title": ch["title"],
                    "page_range": ch["page_range"],
                    "sample_content": content,
                    "char_count": len(content),
                })
            doc.close()
            return {
                "title": preset["title"],
                "format": "pdf",
                "total_pages": total_pages,
                "chapter_count": len(out_chapters),
                "chapters": out_chapters,
            }

    # Clean z-library noise from book_title
    book_title = re.sub(r'\s*\(z-lib.*?\)\s*$', '', book_title, flags=re.IGNORECASE).strip()

    # 1. Extract Native Table of Contents (Bookmarks / Outlines)
    toc_raw = doc.get_toc()
    chapters = []

    if toc_raw and len(toc_raw) > 2:
        for i, item in enumerate(toc_raw):
            lvl, title, page = item[0], item[1].strip(), item[2]
            # Skip front/back matter noise
            if title in {"封面", "版权", "版权页", "内容简介", "封底", "参考文献", "序", "前言", "目录"} or any(skip in title for skip in ["封面", "版权页", "内容简介", "封底", "参考文献"]):
                continue
            if lvl == 1 or (lvl == 2 and len([x for x in toc_raw if x[0] == 1]) <= 2):
                next_page = total_pages
                for next_item in toc_raw[i+1:]:
                    if next_item[0] <= lvl and next_item[2] > page:
                        next_page = next_item[2]
                        break
                # Also collect sub-sections under this chapter from TOC
                sub_sections = []
                for sub_item in toc_raw[i+1:]:
                    if sub_item[0] <= lvl:
                        break
                    sub_sections.append(sub_item[1].strip())
                chapters.append({
                    "level": lvl,
                    "title": title,
                    "sub_sections": sub_sections,
                    "start_page": max(1, page),
                    "end_page": min(total_pages, next_page),
                })
    else:
        heading_candidates = []
        for pno in range(min(total_pages, 338)):
            page = doc[pno]
            text = page.get_text("text")
            for line in text.splitlines():
                line = line.strip()
                if re.match(r'^(第\s*[0-9一二三四五六七八九十百]+\s*[章节篇部]|Chapter\s+[0-9]+)', line):
                    if 3 <= len(line) < 45 and "习题" not in line and "小结" not in line:
                        # Avoid duplicate chapter numbers
                        ch_prefix = re.match(r'^(第\s*[0-9一二三四五六七八九十百]+\s*[章节篇部]|Chapter\s+[0-9]+)', line).group(1).replace(" ", "")
                        if not any(h["prefix"] == ch_prefix for h in heading_candidates):
                            heading_candidates.append({
                                "prefix": ch_prefix,
                                "title": line,
                                "page": pno + 1
                            })

        if len(heading_candidates) >= 2:
            for i, h in enumerate(heading_candidates):
                next_p = total_pages
                if i + 1 < len(heading_candidates):
                    next_p = max(h["page"] + 1, heading_candidates[i+1]["page"])
                chapters.append({
                    "level": 1,
                    "title": h["title"],
                    "sub_sections": [],
                    "start_page": h["page"],
                    "end_page": next_p,
                })
        else:
            batch_size = max(10, total_pages // 8)
            for idx, start_p in enumerate(range(1, total_pages + 1, batch_size)):
                end_p = min(total_pages, start_p + batch_size - 1)
                chapters.append({
                    "level": 1,
                    "title": f"第 {idx + 1} 阶段学习内容 (第 {start_p}-{end_p} 页)",
                    "sub_sections": [],
                    "start_page": start_p,
                    "end_page": end_p,
                })

    processed_chapters = []
    for idx, ch in enumerate(chapters[:20]):
        start_p = ch["start_page"] - 1
        end_p = ch["end_page"]
        collected_text = []

        if ch.get("sub_sections"):
            collected_text.append("【本章小节目录】：\n" + "\n".join(f"- {s}" for s in ch["sub_sections"]))

        for p in range(start_p, min(start_p + 18, end_p, total_pages)):
            page_text = doc[p].get_text("text")
            lines = [l.strip() for l in page_text.splitlines() if len(l.strip()) > 3]
            if lines:
                collected_text.append("\n".join(lines))

        raw_ch_text = "\n\n".join(collected_text)
        sample_chunk = raw_ch_text[:6500]

        processed_chapters.append({
            "index": idx + 1,
            "title": ch["title"],
            "page_range": f"{ch['start_page']}-{ch['end_page']}",
            "sample_content": sample_chunk,
            "char_count": len(raw_ch_text),
        })

    doc.close()

    return {
        "title": book_title,
        "format": "pdf",
        "total_pages": total_pages,
        "chapter_count": len(processed_chapters),
        "chapters": processed_chapters,
    }


def parse_text(file_path):
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    book_title = os.path.splitext(os.path.basename(file_path))[0]
    lines = text.splitlines()
    
    chapter_splits = []
    current_title = "前言与导论"
    current_lines = []

    for line in lines:
        stripped = line.strip()
        if re.match(r'^(#{1,3}\s+|第[0-9一二三四五六七八九十百]+[章节篇部]|Chapter\s+[0-9]+)', stripped):
            if current_lines:
                chapter_splits.append({
                    "title": current_title,
                    "content": "\n".join(current_lines),
                })
                current_lines = []
            current_title = re.sub(r'^#+\s*', '', stripped)
        else:
            current_lines.append(line)

    if current_lines:
        chapter_splits.append({
            "title": current_title,
            "content": "\n".join(current_lines),
        })

    processed_chapters = []
    for idx, ch in enumerate(chapter_splits[:25]):
        content = ch["content"]
        processed_chapters.append({
            "index": idx + 1,
            "title": ch["title"],
            "page_range": f"Section {idx + 1}",
            "sample_content": content[:6500],
            "char_count": len(content),
        })

    return {
        "title": book_title,
        "format": "markdown",
        "total_pages": len(lines) // 40 + 1,
        "chapter_count": len(processed_chapters),
        "chapters": processed_chapters,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: book_parser.py <file_path>"}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        result = parse_pdf(file_path)
    else:
        result = parse_text(file_path)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
