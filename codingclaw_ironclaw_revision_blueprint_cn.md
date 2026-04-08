# CodingClaw自动编码代理系统蓝图与约束文档v0.2

## 1. 文档目的

本文档用于定义 **CodingClaw** 的系统蓝图、治理边界、开发顺序、运行约束、交付规范与审计规则。  
CodingClaw 是基于 **IronClaw** 思路进行二次设计与定制化扩展的自动编码代理系统，其目标不是构建一个无边界、无限制、无审批的“全自动写代码黑盒”，而是建立一套：

- 以中文为控制语言
- 以英文为工程交付语言
- 以可审计循环为核心执行单元
- 以冻结合同为范围控制基础
- 以 Builder / QA 双轨机制提升质量
- 以 Docker 隔离和轨迹归档保证复现性
- 在必要时引入云桌面进行 GUI 特例处理与人工接管

的 **7×24 小时自动编码编排系统**。

新的控制与编排基础以 **IronClaw Fork：CodingClaw** 为准。

---

## 2. 系统定位

### 2.1 定位定义

CodingClaw 的系统定位如下：

> 一个以 IronClaw Fork 为控制外壳、以 coding loop 为执行内核、以真实编码执行器为工作面、以冻结合同和英文交付为治理边界、以中文移动端指挥为控制入口的自动编码代理系统。

### 2.2 设计意图

本系统强调：

- 让控制面、循环面、执行面、归档面分层清晰
- 让每一轮开发都可解释、可暂停、可恢复、可审计
- 让编码动作在开始前先经过计划对齐与合同冻结
- 让长期运行依赖文件状态与任务状态，而不是依赖单次长会话记忆
- 让 Builder 与 QA 的职责天然分离
- 让“自动化”始终处于“受治理、可回滚、可接管”的边界内

### 2.3 合规边界

CodingClaw 仅适用于以下场景：

- 经授权的内部项目
- 经明确许可的外包或协作项目
- 用户自身拥有合法处理权限的代码任务
- 可留档、可追责、可审计的工程环境

CodingClaw 不以规避平台规则、冒充人工身份、伪造开发痕迹、绕过人工责任、逃避授权要求为目标。  
若接入外部题库、项目池或竞赛平台，必须先单独审查平台规则、自动化限制、身份要求和归档要求。

---

## 3. 核心设计结论

### 3.1 用 IronClaw Fork

**CodingClaw（IronClaw Fork）**。 
CodingClaw 负责：

- 中文控制入口
- 任务路由
- 任务状态机
- 调度与预算
- 安全守卫
- 审批点管理
- 风险告警
- 移动端通道适配
- 归档元数据管理

v0.2 的实现方式明确为：

- 以 `IronClaw Fork` 作为控制壳起点，而不是只停留在概念借鉴层
- 对上游仅做边界清晰的选择性同步，不直接继承未审查的私有 prompt 约定或运行假设
- Fork 侧优先承载 `control/`、`ops/`、`contracts/` 相关能力，执行器适配通过 `adapters/` 解耦
- 若上游变更影响审批门、预算守卫、合同结构或审计结构，必须先通过 Change Review 再合入

### 3.2 将 coding loop 上升为第一公民

系统不再把“agent”本身视为唯一核心，而改为将 **coding loop** 定义为核心执行协议。

系统采用如下分层：

- **CodingClaw = Control Shell**
- **Coding Loop = Execution Kernel**
- **Builder / QA Executors = Role-specific Workers**
- **Artifact Storage = Audit Plane**
- **Wuying Desktop = GUI Exception Plane**

### 3.3 文件状态优先于长上下文记忆

系统长期记忆不应依赖模型会话本身，而应依赖文件与状态机，包括：

- `contract-freeze.en.md`
- `progress.en.md`
- `story-queue.json`
- `handoff.en.md`
- `risk-register.en.md`
- `loop-metrics.json`
- `job-manifest.json`

### 3.4 每轮循环必须短、独立、可恢复

每一轮 coding loop 都应：

- 使用清晰的输入合同
- 聚焦一个冻结子目标
- 从磁盘读取长期状态
- 产出本轮变更与状态更新
- 写回日志、报告与 handoff
- 退出后允许下一轮重新进入

### 3.5 计划先行，编码后置

本系统新增一条最高优先级治理规则：

> **任何实际编码开始之前，必须先向用户提交 Development Plan，对齐开发核心方向；只有用户确认后，系统才能生成 Contract Freeze，并允许 Builder 进入真实编码阶段。**

这一规则属于系统级强制门，不能被 Builder、QA、Scheduler 或任何自动重试逻辑绕过。

---

## 4. 顶层架构

## 4.1 总体架构

```text
[User / Mobile]
   | 中文命令 / 中文审批 / 中文摘要
   v
[CodingClaw Control Shell]
   |- Commander
   |- Scheduler
   |- Policy Guard
   |- Budget Guard
   |- Channel Adapters
   |- Approval Gate
   |
   | 英文计划 / 英文合同 / 英文任务包
   v
[Coding Loop Kernel]
   |- Planner Loop
   |- Builder Loop
   |- QA Loop
   |- Fixback Loop
   |
   | repo / state / artifacts / logs
   v
[Execution Workers]
   |- Builder Executor
   |- QA Executor
   |- Optional Review Executor
   |
   v
[Artifact & Metadata Plane]
   |- Repo Workspace
   |- Session Archive
   |- Reports
   |- Checksums
   |- Metadata DB

Optional:
[Aliyun Wuying Desktop]
   |- GUI Exception Handling
   |- Human Takeover
   |- Remote Assistance
```

## 4.2 四层模型

### A. Control Shell

负责：

- 接收中文命令
- 生成英文计划与任务包
- 管理审批点
- 维护预算、并发、限流、停止开关
- 决定何时启动下一轮 loop

### B. Coding Loop Kernel

负责：

- 从冻结合同读取目标
- 将大目标拆解为可执行 story
- 生成本轮 prompt / packet
- 驱动执行器完成一轮工作
- 写回进度、风险、handoff 与状态

### C. Execution Workers

负责：

- 在隔离环境中运行真实执行器
- 修改代码、运行命令、补文档、生成报告
- 将本轮产物输出到可归档目录

### D. Artifact & Metadata Plane

负责：

- 存储 repo、report、session、manifest、checksums
- 作为长期记忆与可审计依据
- 为恢复运行提供状态基础

---

## 5. 角色与职责

### 5.1 用户（Owner）

职责：

- 用中文提出目标、约束和偏好
- 审批 Development Plan
- 审批 Contract Freeze
- 在必要时批准关键变更请求
- 接收中文日报、异常摘要、风险说明

约束：

- 不直接向 Builder / QA 写英文仓库指令
- 不直接在执行容器内进行无记录修改
- 不跳过批准步骤强制开始编码

### 5.2 Commander

职责：

- 接收中文输入
- 产出英文 Development Plan
- 在批准后生成英文 Contract Freeze
- 将后续任务拆成英文 task packet
- 将英文执行结果汇总为中文摘要

约束：

- Commander 不直接写项目代码
- Commander 不伪造执行器轨迹
- Commander 不得越过审批门自动发起编码

### 5.3 Planner Loop

职责：

- 读取目标、约束与项目上下文
- 拆分为 stories / milestones / acceptance criteria
- 产出 Development Plan 草案
- 在冻结后只负责变更控制，不再任意扩展范围

### 5.4 Builder Executor

职责：

- 根据冻结合同与当前 story 进行实现
- 编写英文代码、注释、README、脚本与测试
- 输出本轮实施摘要、self-check、handoff
- 提交 Builder 轨迹与构建证据

约束：

- 不能擅自改变核心目标
- 不能绕过合同边界扩展功能
- 不能把中文混入仓库、注释、README 与报告

### 5.5 QA Executor

职责：

- 验证 Builder 产出是否符合冻结合同
- 复现安装、构建、运行、测试、文档步骤
- 检查交付物是否英文一致
- 检查是否存在 scope drift、缺失依赖和文档断层
- 输出 QA Report 与 Fixback 清单

### 5.6 Scheduler / Ops Guard

职责：

- 安排 loop 执行顺序
- 施加超时与预算
- 控制并发与熔断
- 触发审批点
- 归档运行结果
- 触发人工接管

---

## 6. Language Boundary

系统采用严格双语言边界。

### 6.1 中文允许范围

仅以下内容允许中文：

- 用户与系统对话
- 审批提示
- 中文日报
- 中文风险摘要
- 移动端消息
- 人工接管指令
- 控制面内部中文解释文本
- 控制面蓝图、规划草案、审批记录与控制面归档元数据

### 6.2 英文强制范围

以下内容必须统一使用英文：

- Development Plan
- Contract Freeze
- Story definitions
- Task packets
- Handoff documents
- Code files
- Code comments
- README
- Change logs
- QA reports
- Build summaries
- Run summaries
- 进入目标工程 repo 与最终交付包的全部文档
- 最终全部交付物

### 6.3 语言约束

禁止：

- 中文进入 repo 交付物
- 中文进入注释、README、报告与 handoff
- 中文直接作为 Builder / QA 的执行提示内容

允许：

- 中文需求先在控制面解释
- Commander 将中文需求转写为英文工程合同
- Commander 将英文执行结果再转述为中文状态摘要

---

## 7. Plan-before-Code 治理机制

### 7.1 强制流程

任何项目必须按以下顺序运行：

```text
INTAKE
 -> REQUIREMENT_NORMALIZATION
 -> DEVELOPMENT_PLAN_DRAFT
 -> OWNER_REVIEW
 -> DEVELOPMENT_PLAN_APPROVED
 -> CONTRACT_FREEZE
 -> BUILD_EXECUTION
 -> QA_VALIDATION
 -> FIXBACK(optional)
 -> FINAL_APPROVAL(optional)
 -> ARCHIVE
```

### 7.2 Development Plan 的强制内容

在实际编码前，系统必须向用户提交英文 Development Plan，并附中文摘要。  
Development Plan 至少包括：

- Problem Statement
- Goal Definition
- Non-goals
- Assumptions
- Architecture Direction
- Milestones
- Story Breakdown
- Testing Strategy
- Delivery Checklist
- Risks
- Open Questions
- Approval Requested
- Current Repo Baseline
- Intended Execution Surface
- Approval Touchpoints

### 7.3 用户审批要求

用户至少要明确确认以下内容后，才允许进入编码：

- 核心目标正确
- 非目标定义清楚
- 技术路径方向可接受
- 优先级排序合理
- 风险点已知
- 本轮是否允许进入实现阶段

### 7.4 未获批时的系统行为

若用户未明确批准，则系统只能：

- 继续补充计划
- 回答问题
- 调整 Development Plan
- 输出比较方案
- 停留在待审批状态

系统不得：

- 自动启动 Builder 编码
- 默认视为用户已同意
- 以“先做再看”的方式绕过审批

---

## 8. Contract Freeze 机制

### 8.1 定义

Contract Freeze 是系统级冻结文件，代表本轮项目在进入实际编码前被双方确认的工程合同。

### 8.2 冻结时机

只有在 Development Plan 获得用户批准后，系统才能生成：

- `CONTRACT_FREEZE.en.md`
- `contract-freeze.json`
- `contract-freeze.sha256`

### 8.3 冻结内容

冻结合同至少包括：

- Project Scope
- Core Objective
- Accepted Architecture Direction
- Base Commit / Branch
- Dependency Lock Snapshot
- Approved Adapter Set
- In-scope Features
- Out-of-scope Items
- Quality Bar
- Test Expectations
- Story Traceability Requirements
- Task Packet Hashes
- Delivery Format
- Language Policy
- Time / Budget Guardrails
- Approval Record
- Approval Snapshot
- Freeze Version
- Freeze Timestamp
- Freeze Hash

### 8.3.1 基线绑定规则

Contract Freeze 不是纯文本承诺，而是必须绑定到可验证的工程基线。

最低要求：

- `CONTRACT_FREEZE.en.md` 必须记录 `base_commit`
- `contract-freeze.json` 必须记录依赖锁文件摘要、适配器版本与任务包摘要
- QA 必须验证本轮执行是否从该 `base_commit` 或其批准后的续接 commit 开始
- 若 repo 状态、依赖快照或适配器版本与冻结记录不一致，本轮不得继续执行，必须转入 `CHANGE_REQUEST_REQUIRED` 或重新冻结

### 8.4 冻结后的约束

Builder 与 QA 必须以冻结合同为最高执行依据。

禁止：

- 擅自新增重大功能
- 擅自更换核心技术路线
- 擅自扩大里程碑边界
- 擅自跳过质量标准

### 8.5 Change Request 机制

若执行中发现必须变更冻结合同，应进入：

```text
CHANGE_REQUEST_DRAFT
 -> OWNER_REVIEW
 -> APPROVED_CHANGESET
 -> CONTRACT_FREEZE_V2
```

任何超出当前冻结边界的动作，都必须先经过 Change Request。

---

## 9. Coding Loop 内核设计

### 9.1 Loop 的核心原则

Loop 必须满足以下特征：

- 短回合
- 单目标
- 可审计
- 可恢复
- 可暂停
- 可插拔执行器
- 文件驱动
- Git 驱动

### 9.2 标准循环步骤

```text
LOAD_CONTRACT
 -> LOAD_PROGRESS
 -> SELECT_NEXT_STORY
 -> BUILD_PROMPT_PACKET
 -> RUN_EXECUTOR
 -> COLLECT_OUTPUTS
 -> RUN_SELF_CHECK
 -> WRITE_HANDOFF
 -> UPDATE_PROGRESS
 -> DECIDE_NEXT_STEP
```

### 9.3 Story 粒度规则

每轮 loop 只允许处理一个明确 story。  
story 应具备：

- `story_id`
- 单一目标
- 明确输入
- 明确完成条件
- 对应 `acceptance_ids`
- 明确测试方法
- 明确退出条件
- 对应的证据落点

每个 story 必须能从 `story_id -> acceptance_ids -> mandatory checks -> QA verdict -> artifacts` 完整追踪，不能只靠自由文本摘要判断是否完成。

### 9.4 Loop 的长期记忆文件

推荐维护：

```text
state/
  progress.en.md
  story-queue.json
  active-story.json
  handoff.en.md
  risk-register.en.md
  loop-metrics.json
  decisions.en.md
  trace-index.json
```

### 9.5 Loop 退出条件

当满足以下任一条件时，本轮必须退出：

- story 完成
- 测试失败且达到修复阈值
- 超时
- 预算耗尽
- 触发危险命令审批
- 需要 Change Request
- 需要人工接管
- 需要额外凭据或外部访问

---

## 10. Execution Worker 设计规范

### 10.1 总体原则

Execution Worker 必须：

- 短生命周期
- 每 job 隔离
- 可销毁
- 状态外置
- 失败可重建
- 输入输出标准化

### 10.2 容器分类建议

至少维护三类 worker：

- `worker-base`
- `worker-builder`
- `worker-qa`

可选扩展：

- `worker-release-review`
- `worker-gui-bridge`
- `worker-test-matrix`

### 10.3 必备挂载目录

```text
/work/repo
/work/state
/work/artifacts
/work/cache
/work/runtime-home
```

### 10.4 每轮执行的输入

Worker 启动时必须显式读取：

- 冻结合同
- 冻结基线元数据
- 当前 story
- 当前 repo 状态
- 上一轮 handoff
- 风险登记
- 本轮任务包
- 安全策略与预算限制
- 审批上下文
- 临时凭据引用

### 10.5 每轮执行的输出

至少输出：

- 改动后的 repo
- `implementation-summary.en.md`
- `self-check.en.md`
- `handoff.en.md`
- `command-log.txt`
- `test-results/`
- 本轮运行元数据
- 如适用，执行器会话轨迹

---

## 11. Builder / QA 双轨机制

### 11.1 Builder 流程

```text
LOAD_STORY
 -> IMPLEMENT
 -> RUN_LOCAL_TESTS
 -> UPDATE_DOCS
 -> WRITE_SELF_CHECK
 -> PACKAGE_FOR_QA
```

Builder 输出：

- 代码变更
- README 更新
- 测试结果
- 自检报告
- handoff
- Builder 运行轨迹

### 11.2 QA 流程

```text
LOAD_FREEZE
 -> LOAD_REPO
 -> VALIDATE_SCOPE
 -> VALIDATE_BUILD
 -> VALIDATE_RUN
 -> VALIDATE_TESTS
 -> VALIDATE_DOCS
 -> ISSUE_REPORT
 -> PASS_OR_FIXBACK
```

QA 输出：

- `qa-report.en.md`
- `fixback-items.en.md`
- QA 运行轨迹
- 复现实验记录
- 失败证据与日志路径

### 11.3 QA 的重点检查面

QA 除了工程检查，还必须检查：

- 是否偏离冻结合同
- 是否出现 scope creep
- 是否夹带未批准的大改
- 是否违反英文交付规则
- 是否存在“说明写了但 repo 不可复现”的问题
- story、acceptance、命令结果与证据是否可追踪闭环

### 11.4 修复闭环

建议最多进行 2~3 轮 Fixback：

```text
Builder -> QA -> Builder -> QA
```

超过阈值后应自动进入：

- `AWAITING_OWNER_DECISION`
- `CHANGE_REQUEST_REQUIRED`
- 或 `TERMINATED_WITH_RISK_REPORT`

---

## 12. GitHub 开源参考实现对照矩阵

### 12.1 设计思路来源

CodingClaw 的修订版并非复制单一项目，而是吸收多类开源工程思路：

- IronClaw：控制外壳、工作空间、通道、例程、worker 与安全壳
- Ralph / Ralph Loop：文件驱动的 coding loop、每轮 fresh context、按 story 递进
- Aider：面向现有 repo 的小步改动与 git 驱动执行
- GPT-Engineer：预设角色提示包与项目模板化生成
- OpenHands：控制层、执行层、界面层分离的工程产品思维
- 连续化代理项目：日志轮换、限流、退出检测、长时任务韧性

### 12.2 参考映射表

| 开源方向 | 可吸收机制 | 在 CodingClaw 中的落点 |
|---|---|---|
| IronClaw | 控制外壳、通道、worker、任务编排 | `control/`、`channels/`、`ops/` |
| Ralph | 文件记忆、story loop、fresh context | `core/loop/`、`state/` |
| Ralph Loop | agent-agnostic wrapper | `adapters/` |
| Aider | repo patching、git 驱动 | `core/patching/` |
| GPT-Engineer | role packs、preprompt scaffolding | `core/roles/` |
| OpenHands | 分层式产品架构 | 顶层模块边界 |
| Continuous agent frameworks | 运行守卫、限流、持续循环 | `ops/guards/` |

### 12.3 吸收原则

必须坚持：

- 吸收设计模式，不盲目堆叠功能
- 保持执行器可替换
- 保持 loop 可插拔
- 保持审批门不可绕过
- 保持 artifact-first 审计思路

### 12.4 当前仓库起点判断

当前仓库以蓝图文档为起点，尚不存在可复用的控制面、worker、adapter、state schema 或测试骨架。

因此 v0.2 的现实判断是：

- 这是 greenfield 实施，不是假定已有系统上的增量修补
- “What already exists” 目前主要是设计结论与治理边界，不是现成模块
- MVP 必须优先交付最短闭环，而不是同时铺开多执行器、多通道、多桌面桥接

---

## 13. CodingClaw Fork 目录建议

```text
codingclaw/
  README.md
  docs/
    SYSTEM_BLUEPRINT.md
    ARCHITECTURE_OVERVIEW.md
    DEPLOYMENT_PLAN.md
    RUNBOOK.md
    CONTRACT_POLICY.md
    CHANGE_REQUEST_POLICY.md
    LOOP_SPEC.md
    ARTIFACT_SPEC.md
    SECURITY_POLICY.md
    WUYING_INTEGRATION_PLAN.md

  control/
    commander/
    scheduler/
    approvals/
    policy/
    budget/
    alerts/

  core/
    loop/
    roles/
    patching/
    planning/
    qa/
    contracts/

  adapters/
    codex/
    aider/
    generic-cli/

  channels/
    telegram/
    dingtalk/
    qq/

  ops/
    workers/
    guards/
    archive/
    checksums/
    recovery/

  state/
    schemas/
    templates/

  artifacts/
    templates/

  scripts/
  docker/
  tests/
```

---

## 14. 任务状态机

### 14.1 主状态机

```text
TASK_CREATED
 -> REQUIREMENT_NORMALIZED
 -> PLAN_DRAFTED
 -> OWNER_REVIEW
 -> PLAN_APPROVED
 -> CONTRACT_FROZEN
 -> STORY_QUEUED
 -> BUILDER_RUNNING
 -> BUILDER_SELF_CHECK
 -> QA_RUNNING
 -> FIXBACK(optional)
 -> READY_FOR_FINAL_APPROVAL(optional)
 -> ARCHIVED
 -> REPORTED
```

### 14.2 异常状态

```text
FAILED_BUILD
FAILED_QA
FAILED_INFRA
TIMEOUT
BUDGET_EXCEEDED
CHANGE_REQUEST_REQUIRED
AWAITING_OWNER
AWAITING_HUMAN_TAKEOVER
STOPPED_BY_OWNER
```

---

## 15. 元数据、归档与审计

### 15.1 每个任务必须保存的目录

```text
/jobs/<job_id>/
  repo/
  state/
  artifacts/
  runtime-home/
  DEVELOPMENT_PLAN.en.md
  CONTRACT_FREEZE.en.md
  contract-freeze.json
  job-manifest.json
  checksums.txt
```

### 15.2 推荐 artifacts 结构

```text
artifacts/
  reports/
    implementation-summary.en.md
    self-check.en.md
    qa-report.en.md
    fixback-items.en.md
    final-summary.en.md

  logs/
    builder.log
    qa.log
    commands.log
    compose.log

  evidence/
    test-results/
    screenshots/
    ci-exports/

  sessions/
    builder/
    qa/

  metadata/
    loop-metrics.json
    environment.json
    timings.json
```

### 15.3 必须校验的对象

必须生成摘要校验值的对象包括：

- Contract Freeze
- Development Plan
- final repo archive
- QA report
- final summary
- 关键 session / run log
- 重要构建证据

---

## 16. 安全、预算与守卫机制

### 16.1 预算控制

必须支持：

- 日预算上限
- 单任务预算上限
- 单轮 loop 时间上限
- 单任务最大修复次数
- 高成本命令审批

### 16.2 安全守卫

必须支持：

- E-stop
- 风险命令白名单 / 黑名单
- 限流
- 熔断
- 人工审批门
- 凭据隔离
- 日志脱敏
- 网络访问策略

### 16.3 运行安全

要求：

- 控制面默认只监听内网
- 远程入口走安全隧道
- 不同任务隔离 repo 与凭据
- 长期密钥交由外部秘密管理系统
- 普通日志中不得输出敏感 token

### 16.4 凭据与审批生命周期

系统对凭据与高风险动作必须采用短租约、显式审批、可回收的治理方式。

最低要求：

- 控制面不直接把长期凭据写入 task packet
- Worker 只接收临时凭据引用或短时注入结果
- 任何新增网络写入、生产环境写入、容器控制或浏览器登录都必须显式声明审批要求
- 审批被拒绝后，执行器必须返回标准退出状态，不得继续尝试变通执行
- 日志、summary、report、artifact index 必须统一经过脱敏流程后才能归档

---

## 17. 阿里无影云电脑集成策略

### 17.1 定位

阿里无影不是主编码执行面，而是：

- GUI 特例平面
- 人工接管平面
- 远程协助平面
- Windows-only / 桌面类工具处理平面

### 17.2 推荐使用顺序

优先级建议：

1. API / 管控 SDK 层面的资源管理
2. Web SDK 桥接页层面的远程接入
3. 人工接管
4. 半自动 GUI 操作

### 17.3 不推荐方式

不推荐将无影作为：

- 主 Builder 执行器
- 全天候唯一编码环境
- 全链路自动点击执行核心

### 17.4 正确的接入方式

当任务涉及 GUI 场景时：

```text
DETECT_GUI_EXCEPTION
 -> PAUSE_MAIN_LOOP
 -> PREPARE_TAKEOVER_PACKET.en.md
 -> OPEN_WUYING_BRIDGE
 -> HUMAN_OR_ASSISTED_ACTION
 -> COLLECT_RESULT
 -> RETURN_TO_MAIN_LOOP
```

---

## 18. 移动端控制与中文汇报

### 18.1 建议输入渠道

优先级建议：

1. Telegram
2. 钉钉
3. QQ

### 18.2 中文控制命令建议

- 开始处理任务
- 查看当前计划
- 批准计划
- 拒绝计划
- 冻结合同
- 查看当前风险
- 允许变更请求
- 暂停当前任务
- 恢复任务
- 紧急停机
- 导出交付包
- 启动人工接管

### 18.3 中文输出建议

- 当前阶段
- 当前 story
- 风险摘要
- 待审批事项
- 最近一次失败原因
- 已归档路径
- 预计下一步动作
- 是否需要变更请求

### 18.4 控制面交互合同

移动端控制不是只靠口令字符串，而应有稳定的审批与恢复载荷。

最低要求：

- 每个待审批动作必须带 `job_id`、`story_id`、风险级别、超时时间与候选动作
- 每个“恢复任务”动作必须回显最近一次退出原因、当前冻结版本、当前 story 与上次证据路径
- 控制面必须维护待处理审批队列，避免多个任务同时等待时发生误批
- 同一任务若存在多个未决审批，后到审批不得覆盖先到审批

---

## 19. MVP 分期

### Phase 1：最小可运行版本

目标：

- CodingClaw 控制面可运行
- Telegram 或钉钉二选一作为中文入口
- 单机 Docker worker
- Plan-before-code 审批流
- 绑定基线的 Contract Freeze 生成与校验
- Builder / QA 双轨
- 基础归档与 checksums
- 单一 `Generic CLI Adapter`
- 单任务、单 repo、单 active story 闭环

必须完成：

- 中文命令入口
- 英文 Development Plan 模板
- 英文 Contract Freeze 模板
- `base_commit` 与依赖摘要写入冻结合同
- story queue
- `story_id -> acceptance_ids -> qa-verdict` 追踪链
- 单轮 Builder 执行
- 单轮 QA 执行
- fixback 闭环
- 中文摘要输出
- 审批卡片与恢复卡片

Phase 1 明确不纳入：

- 多通道同时接入
- 多执行器并行接入
- 无影桥接
- Dashboard
- 历史任务复用
- 生产级多任务调度

### Phase 2：稳定性增强

目标：

- Redis / Postgres 元数据层
- 更细的预算与限流
- 告警系统
- 崩溃恢复
- 证据与截图归档
- 多任务队列

### Phase 3：执行器适配增强

目标：

- Codex 适配器
- Aider 适配器
- 通用 CLI 适配器
- role packs
- test matrix 支持

### Phase 4：无影与人工接管

目标：

- 管控 SDK 接入
- Web SDK bridge
- GUI 特例中断与恢复流程
- 移动端触发人工接管

### Phase 5：运营能力

目标：

- 中文日报
- 成本分析
- 轨迹检索
- 历史任务复用
- Dashboard

---

## 20. 必要文档清单

### 20.1 核心蓝图文档

- `SYSTEM_BLUEPRINT.md`
- `ARCHITECTURE_OVERVIEW.md`
- `DEPLOYMENT_PLAN.md`

### 20.2 治理文档

- `CONTRACT_POLICY.md`
- `CHANGE_REQUEST_POLICY.md`
- `LANGUAGE_BOUNDARY_POLICY.md`
- `SECURITY_POLICY.md`
- `BUDGET_POLICY.md`
- `APPROVAL_CARD_SPEC.md`

### 20.3 Loop 与角色文档

- `LOOP_SPEC.md`
- `PLANNER_CONTRACT.en.md`
- `BUILDER_CONTRACT.en.md`
- `QA_CONTRACT.en.md`
- `TASK_PACKET_TEMPLATE.en.md`
- `HANDOFF_TEMPLATE.en.md`
- `TRACEABILITY_SPEC.md`

### 20.4 归档文档

- `ARTIFACT_LAYOUT_SPEC.md`
- `CHECKSUM_POLICY.md`
- `JOB_MANIFEST_SCHEMA.md`

### 20.5 无影相关文档

- `WUYING_INTEGRATION_PLAN.md`
- `TAKEOVER_FLOW.md`
- `GUI_EXCEPTION_POLICY.md`

---

## 21. 明确非目标

以下内容不属于当前版本目标：

- 跳过用户审批直接开始编码
- 让 GUI 云桌面成为主编码执行面
- 依赖单一长会话连续完成所有任务
- 不做预算、不做熔断地无限循环
- 伪造执行器轨迹代替真实运行痕迹
- 允许中文进入英文工程交付物
- 允许 Builder 擅自突破冻结合同范围

---

## 22. 推荐落地顺序

建议开发顺序如下：

1. 先确定 **IronClaw Fork 集成边界 + Generic CLI Adapter Contract**。
2. 再实现 **CodingClaw 控制面 + Planning 审批流 + 绑定基线的 Contract Freeze**。
3. 跑通单轮 **Builder / QA**，确保 story traceability 与 QA verdict 成立。
4. 补充归档、checksums、失败恢复、审批卡片与预算约束。
5. 再扩展执行器适配层。
6. 最后接入无影桥接与高级运营能力。

---

## 23. 一句话架构定义

> CodingClaw 是一个以 IronClaw Fork 为控制外壳、以 coding loop 为执行内核、以冻结合同为范围边界、以 Builder/QA 双轨为质量机制、以 Docker 隔离和归档为审计基础、并在必要时借助阿里无影完成 GUI 特例处理与人工接管的自动编码代理系统。

---

## 24. 实施建议摘要

如果立即开始开发，建议只做以下最小闭环：

- 中文入口：Telegram 或钉钉
- 控制面：CodingClaw
- 计划门：Development Plan + 用户审批 + 审批卡片
- 范围门：Contract Freeze + Hash + Base Commit
- 执行面：Builder Worker + QA Worker + Generic CLI Adapter
- 状态面：story queue + progress + handoff + trace index
- 存储：本地卷 + SQLite / Postgres
- 归档：repo + reports + logs + checksums
- 输出：中文摘要 + 英文交付包

这条路线比直接堆砌多代理更稳，也更符合长期运行、可回放、可修复、可治理的工程目标。

## 24. Executor Adapter Contract

### 24.1 定位

`Executor Adapter Contract` 是 v0.2 最关键的新协议。

它的作用是：

- 让控制面不直接依赖某个执行器的私有接口
- 让 loop 内核只关心标准输入输出
- 让执行器替换成为低风险动作
- 让预算、安全、审批、日志、证据被统一治理

### 24.2 系统原则

控制面与执行器之间只允许通过以下对象交互：

- 标准输入包
- 能力声明
- 标准输出包
- 审批请求对象
- 统一退出状态

禁止：

- 控制面直接拼接某执行器的私有 prompt 作为唯一协议
- 执行器私自写入未声明目录
- 执行器私自吞掉失败状态
- 执行器绕过审批直接执行危险动作

### 24.3 适配器注册对象

每个适配器至少要注册：

- `adapter.json`
- `adapter-capability.json`
- `adapter-policy.json`

`adapter.json` 至少包含：

- adapter id
- executor family
- supported roles
- supported run modes
- supported approval hooks
- supported credential model
- supported sandbox model
- supported artifact outputs
- supported trace schema
- adapter version

### 24.4 标准输入包

每轮执行前，控制面必须向适配器提供标准输入包：

- `job_id`
- `freeze_id`
- `story_id`
- `run_role`
- `run_attempt`
- `repo_path`
- `base_commit`
- `state_path`
- `artifact_path`
- `runtime_home`
- `task_packet_path`
- `task_packet_sha256`
- `budget_limits`
- `time_limits`
- `policy_profile`
- `risk_context`
- `previous_handoff_path`
- `approval_context`
- `approval_snapshot_path`
- `trace_context`
- `requested_capabilities`

其中 `run_role` 只允许：

- `builder`
- `qa`
- `review`

### 24.5 Task Packet 规范

`task-packet.en.json` 是本轮执行任务包，必须由控制面生成，不允许执行器自行补全核心边界。

任务包至少包括：

- story id
- story objective
- acceptance ids
- in-scope checklist
- out-of-scope checklist
- acceptance criteria
- mandatory commands or checks
- verification targets
- expected artifacts
- language policy
- stop conditions
- escalation rules

### 24.6 Capability Manifest

每个适配器必须显式声明自身能力，不允许隐式假设。

能力清单至少覆盖：

- filesystem read
- filesystem write
- shell command
- git
- network
- browser
- container control
- screenshot
- secret injection
- interactive approval
- session export

每项能力都应带有：

- allow or deny
- allowlist or scope
- cost level
- risk level
- approval requirement

### 24.7 标准输出包

执行结束后，适配器必须统一返回：

- `run-result.json`
- `artifact-index.json`
- `command-log.txt`
- `handoff.en.md`

根据角色补充输出：

- Builder: `implementation-summary.en.md`、`self-check.en.md`、`test-results/`
- QA: `qa-report.en.md`、`fixback-items.en.md`、`qa-verdict.json`

`run-result.json` 至少包含：

- job id
- freeze id
- story id
- run role
- adapter id
- base commit
- head commit
- start timestamp
- end timestamp
- exit status
- summary
- acceptance status
- approval events
- repo diff summary
- artifact refs
- evidence refs
- trace refs
- metrics refs

### 24.8 统一退出状态

适配器只能返回以下标准退出状态：

- `SUCCESS`
- `FIXBACK_REQUIRED`
- `CHANGE_REQUEST_REQUIRED`
- `AWAITING_APPROVAL`
- `AWAITING_CREDENTIALS`
- `AWAITING_TAKEOVER`
- `FAILED_POLICY`
- `FAILED_EXECUTION`
- `FAILED_INFRA`
- `TIMEOUT`
- `BUDGET_EXCEEDED`

控制面必须按退出状态驱动主状态机，不允许依赖自由文本猜测。

### 24.9 审批回调机制

若执行器遇到危险命令、高成本动作、需要额外权限或高风险变更，必须返回标准审批对象，而不是继续执行。

审批对象至少包括：

- request id
- related job id
- related story id
- action summary
- reason
- risk level
- requested capability
- suggested alternatives
- timeout

### 24.10 观测与证据要求

适配器必须输出可审计观测信息：

- 命令轨迹
- 关键错误
- 测试结果
- 产物索引
- 运行时长
- 预算消耗
- 成本估算
- 关键证据路径

日志必须支持脱敏，禁止明文写出长期 token。

### 24.11 一致性测试

任何新适配器接入生产前，必须通过一致性测试，至少验证：

- 输入包解析
- 冻结基线匹配
- 合同边界遵守
- 输出包完整性
- 标准退出状态正确性
- 审批中断与恢复
- 审批拒绝后的正确退出
- 崩溃后重试
- traceability 完整性
- artifact 导出
- 日志脱敏

### 24.12 v0.2 的实现优先级

v0.2 不追求一次接完所有执行器。

推荐顺序：

1. 先冻结 `Executor Adapter Contract`
2. 先实现一个 `Generic CLI Adapter`
3. 再实现 `Codex Adapter`
4. 再实现 `Aider Adapter`

---
