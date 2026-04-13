# CodingClaw 团队协作工作流迁移方案

## 目的

本文档定义了 CodingClaw 从 prompt2repo 风格的单人开发，迁移到团队协作开发工作流的推荐路径。

目标不是把当前 Phase 1 内核替换成外部多 agent runtime，而是在不破坏当前内核边界的前提下，在外层增加团队协作壳层，用于承接 issue、worktree 隔离、PR 审查、合并治理和部署门禁。

## 给负责人的结论

- 保留当前内核，不重写。
- 团队协作能力放在 GitHub 和 oh-my-codex 的外层工作流上，不塞进 loop kernel。
- 默认工作单元不是“大任务”，而是“一个 issue 拆成一个或多个 story，每个 story 单独 freeze、单独执行、单独 PR”。
- 如果要支撑多人并行，必须先补 runtime hardening，再扩 team shell。
- 如果公司内部流程和公开仓库流程差异大，应该拆成两套独立部署，并允许维护 `codingclaw-custom` 私有协作线。

一句话版本：

CodingClaw 的正确演进方向不是“把它改造成一个重型团队 agent 平台”，而是“保留当前可审计的单 story 执行内核，在外层加上团队治理、分支治理、PR 治理和部署治理”。

## 核心决策

CodingClaw 应采用双层模型：

- 内层保留现有 `Development Plan -> Contract Freeze -> one-story loop -> Builder -> QA -> archive` 执行内核
- 外层增加以 GitHub 为中心的团队协作壳层，负责 issue 路由、worktree 隔离、分支治理、PR 审查、合并控制和部署门禁
- 当团队规模、权限边界或公司内部流程需要时，运行两套独立的 CodingClaw 部署
- 允许维护 `codingclaw-custom` fork，用于承接公司特有的流程策略、私有 adapter、内部 agent 系统和部署规则

这是当前仓库最匹配的路线，因为仓库现有设计已经明确：

- 内核应保持小而可审计
- 不应把外部产品壳、team runtime、memory layer、orchestration stack 直接导入核心运行时

## 当前仓库中必须保留的边界

### 1. 计划先于编码

`docs/SYSTEM_BLUEPRINT.md` 已经定义了最重要的制度边界：

- 先计划再编码
- 先 freeze 再执行
- 一次 loop 只做一个 story
- 状态落文件，不依赖会话记忆
- Builder 和 QA 必须分离
- 仓库交付物统一英文

这些边界不能因为“团队协作”而被弱化。

### 2. One Story Per Loop

`docs/LOOP_SPEC.md` 已明确规定，一次 loop 不允许把多个独立 story 合并执行。

因此未来的团队协作模型必须是：

- `issue -> story queue`
- `story -> freeze`
- `story -> run`
- `story -> artifact`
- `story -> PR`

而不是：

- 一个 issue 下多人同时往一个大 branch 里堆改动
- 一个 loop 同时处理多个 story

### 3. 内核只借鉴，不吞并外部 runtime

`docs/LIGHTWEIGHT_RUNTIME_PLAN.md` 已明确说明：

- 可以借鉴 oh-my-codex 的状态、规划和 guard 思想
- 可以借鉴 IronClaw 的 capability 和安全边界思想
- 但不能把它们的 product shell、team runtime、memory system、orchestration stack 直接导入内核

所以团队化改造必须走“外层壳”路线，而不是“整体替换内核”路线。

### 4. 归档与证据链优先

现有仓库已经围绕这些对象建立了审计体系：

- `task-packet`
- `run-result`
- `artifact-index`
- `handoff`
- `checksums`
- 各类 reports

团队协作不能退化成“靠聊天记录和 PR 对话驱动”，而必须继续保留这套文件化证据链。

## 当前仓库已经具备的可复用资产

- `.github/ISSUE_TEMPLATE/` 已有结构化 issue 入口
- `.github/pull_request_template.md` 已包含 scope、contract impact、verification、evidence、risks
- `.github/workflows/verify.yml` 已有基础验证 workflow
- `.github/workflows/enforce-repo-gate.yml` 与 `scripts/github_repo_gate.py` 已有最小仓库门禁基础
- `docs/REVIEW_CONTRACT.en.md` 已具备独立 review lane 的雏形
- `state/`、`task-packet`、`run-result`、`artifact-index`、`handoff`、checksum 体系已经可以承接团队协作的审计面

这意味着 CodingClaw 不是“完全没有团队化基础”，而是“缺少外层协作治理层”。

## 当前最明显的缺口

### 1. 仓库保护还偏单人模式

当前 `scripts/github_repo_gate.py` 主要还是：

- required status check
- linear history
- conversation resolution
- 禁止 force push
- 禁止删除分支

但还没有真正进入团队 PR 治理所需的配置，例如：

- required reviews
- CODEOWNERS review
- stale review dismissal
- merge queue

### 2. Live path 仍停在 QA

当前 live path 仍然主要是：

- Builder
- QA

独立 review、merge、deploy 还没有真正进入第一方执行路径。

### 3. Team 并发前的基础硬化还没完成

仓库当前仍把以下能力视为“下一阶段硬化项”：

- atomic state writes
- scoped state resolution
- capability deny-by-default
- shell guard
- credential guard

如果在这些没收口之前就把多人并发、worktree 并发、team shell 大规模铺开，会把团队流程建在未封口的状态和权限模型之上。

## 外部调研结论

## 1. Oh My Codex 的启发

公开文档显示：

- `Ralph` 适合承担“持续推进直到完成和验证通过”的闭环角色
- `Team` 适合承担“并行分工执行”的外层协调角色
- 推荐 workflow 本身就强调 worktree 隔离、并行 issue、独立 PR 和最后收口

对 CodingClaw 的直接启发是：

- `Ralph` 负责一个 story 的完成闭环
- `Team` 负责多个 story 或多个 issue 的并行协调
- 并行性放在外层，不放进单个 loop 内核

## 2. GitHub 的启发

官方文档足够支撑以下协作治理组件：

- rulesets / protected branches
- CODEOWNERS
- merge queue
- reusable workflows
- self-hosted runners
- deployment environments
- fork PR

对 CodingClaw 的直接启发是：

- 团队治理主要应当落在 GitHub 的仓库规则、分支规则、审核规则、runner 边界和 deployment environment 上
- 不应把这些组织级治理逻辑硬编码进 loop runtime

## 推荐目标模型

## 1. 内核与协作壳分离

内核继续负责：

- requirement normalization
- development plan approval
- contract freeze 绑定 `base_commit`
- one-story execution
- Builder
- QA
- artifact archive

协作壳负责：

- issue triage
- story slicing
- worktree creation
- branch naming
- PR creation
- review assignment
- merge queue
- environment promotion
- upstream / fork sync

这个分层是整个方案最关键的设计原则。

## 2. 默认工作单元

团队默认工作单元应定义为：

- 一个 GitHub issue
- 当 issue 超过一个 story 时，先拆成 story queue
- 每个 branch 只承载一个已批准 story
- 每个 active story 使用一个独立 worktree
- 每个 story 有自己独立的 freeze、run、artifact set
- 默认每个 story 对应一个 PR

必须明确：

- 一个 issue 可以拆成多个 story
- 但一个 loop 只能执行一个 story
- 一个 PR 默认也不应打包多个 story

## 3. 推荐分支拓扑

### 在 `codingclaw-custom` 中默认采用

- `main`: 发布与归档主分支，保护最强
- `dev`: 团队集成分支，小 scope issue 先合到这里
- `story/<story-id>-<slug>`: 单 story 短期分支
- `hotfix/<id>-<slug>`: 紧急修复分支
- `sync/upstream-<date>`: 从上游同步时使用的短期分支

这样做的好处：

- `dev` 用于承接团队高频并行提交
- `main` 用于承接强门禁发布
- upstream sync 保持显式且可审查

### 在公开 upstream 中默认采用

- 只保留一个长期受保护的 `main`
- 其他仅使用短期 feature / fix 分支

只有当上游自身 PR 并发量足够大时，才考虑引入 `dev` 和 merge queue。

这样可以避免 upstream 和 custom fork 同时维护双长期分支，降低 fork drag。

## 4. 推荐日常工作流

### Intake And Planning

- 用现有 issue forms 创建 issue
- 如有必要，将 issue 拆成 story queue
- 每次只选择一个已批准 story 进入执行
- 产出或更新 `DEVELOPMENT_PLAN.en.md`
- 完成 owner approval
- 产出或更新 `CONTRACT_FREEZE.en.md` 及相关 freeze artifacts

### Implementation

- 从 `dev` 拉出一个 story 专属 worktree
- 使用 `Ralph` 推进该单 story 的实现闭环
- 所有本地执行证据继续归档到 run artifact set
- worktree 必须保持单一用途

### Review

- 从 `story/<story-id>-<slug>` 向 `dev` 发 PR
- 要求 `verify`
- 要求至少一个独立 reviewer
- 要求 CODEOWNERS review
- 运行基于 `docs/REVIEW_CONTRACT.en.md` 的 review lane

### Merge And Promotion

- 先通过 merge queue 合入 `dev`
- 在 `dev` 上做集成验证
- 再通过 release PR 从 `dev` 提升到 `main`
- 生产发布必须经过 deployment environment approval

### Handoff And Recovery

- 中断时用 checkpoint 保留状态
- takeover 场景继续使用现有 takeover packet 和 approval card 模型
- 不使用临时聊天记录替代正式 handoff

## 5. Oh My Codex 角色映射

建议在外层这样使用 oh-my-codex：

- `ralplan`: 当 issue 跨模块或不够清晰时，先把它收敛成可执行计划
- `team`: 当多个 issue 或多个 story 可以并行时，负责分工协调
- `ralph`: 负责一个已批准 story 的完成闭环
- `review`: 用于 PR 落地前的审查
- `ship`: 用于推分支和发 PR
- `checkpoint`: 用于中断后的恢复
- `trace`: 用于回看多 agent 执行轨迹

一句话职责划分：

- `Ralph` 负责“一个 story 做到底”
- `Team` 负责“多个 story 并行推进”
- GitHub 负责“谁能合、何时合、能否发”

## 6. GitHub 治理改造建议

### Repository Rules

在当前最小 gate 之上，补齐这些规则：

- required status checks
- required conversation resolution
- required linear history
- 禁止 force push
- 禁止删除分支
- 强制走 pull request
- `dev` 至少 1 个 approval 且要求 CODEOWNERS review
- `main` 至少 2 个 approvals 且要求 CODEOWNERS review
- 新 commit 进入后自动 dismiss stale reviews

这里要注意，规则必须写成可落地的 AND 语义，不能写成模糊的 OR 语义。

### CODEOWNERS

建议新增 `.github/CODEOWNERS`，至少覆盖：

- `core/`
- `control/`
- `adapters/`
- `ops/`
- `.github/`
- `docs/`

### Merge Queue

建议在 `dev` 先启用 merge queue，后续再视情况扩到 `main`。

必要前提：

- `.github/workflows/verify.yml` 需要支持 `merge_group`

### Reusable Workflows

建议把 workflow 拆成可复用模块：

- `_verify.yml`
- `_review-lane.yml`
- `_deploy.yml`
- `_repo-governance.yml`

### Deployment Environments

至少建立：

- `staging`
- `production`

用于承接：

- environment-specific secrets
- required reviewers
- deployment promotion gates
- branch restrictions
- 仅允许 trusted branches 访问 production

### Runners

建议使用两类 runner：

- GitHub-hosted runners：普通仓库验证
- self-hosted 或 ephemeral runners：重型后端 agent、GUI automation、内网系统、私有依赖

建议 runner labels：

- `codingclaw-build`
- `codingclaw-qa`
- `codingclaw-review`
- `codingclaw-agent`

### 信任边界必须写死

- fork PR 只跑 GitHub-hosted 的只读最小验证
- fork PR 不允许触达 self-hosted runners
- fork PR 不允许访问受保护 deployment environments
- `.github/workflows/**` 改动必须先进入 trusted branch，之后才能触发私有 runner 或受保护 environment
- production environment 只接受受信保护分支

## 7. 双部署策略

当你既要维护公开方向，又要维护公司内协作流时，建议运行两套独立 CodingClaw：

### Deployment A: Upstream / Public Baseline

- 跟随 canonical repository
- 尽量保持公共 contract 和通用能力
- 只使用 public-safe workflows 与 public-safe secrets
- 默认只维护受保护的 `main`

### Deployment B: Company Collaboration Stack

- 跑在 `codingclaw-custom`
- 承载公司私有 adapter、workflow rules、内部 backend agent 集成和部署策略
- 使用 self-hosted runners 和 private secrets
- 对接公司内部系统

### Fork Policy

`codingclaw-custom` 只承载真正公司特有的东西：

- private adapters
- private skill / policy wrappers
- internal deployment integrations
- internal approval hooks
- company-specific `.github/` automation

而以下内容应尽量回推 upstream：

- contract clarifications
- runtime hardening
- generic review lane logic
- generic runner abstractions
- generic governance improvements

这样才能控制长期 fork 维护成本。

## 8. 实施路线

### Phase 0: Governance Baseline

- 增加 `.github/CODEOWNERS`
- 升级仓库规则，不再只依赖当前 `github_repo_gate.py`
- 给 `verify` 加上 `merge_group` 支持
- 明确 `.github/`、`docs/`、`core/`、`control/`、`ops/`、`adapters/` 的 ownership

### Phase 1: Runtime Hardening Baseline

- 完成 atomic state writes
- 完成 scoped state resolution
- 完成 capability deny-by-default
- 完成 shell and credential guards

这是团队并发扩张前的安全地板，不能后置。

### Phase 2: Team Shell

- 正式定义 `issue -> story -> branch -> PR` 契约
- 为每个 active story 建立 worktree discipline
- 固化 branch naming 和 PR metadata
- 明确什么场景用 `Ralph`，什么场景用 `Team`

### Phase 3: Review And Merge Lane

- 把 `docs/REVIEW_CONTRACT.en.md` 升级成真实 review lane
- 合并前必须有独立 review evidence
- 打通 `dev -> main` 的 release promotion

### Phase 4: Dual Deployment

- 如有需要，搭建 `codingclaw-custom`
- 分离 public/private workflows、runners、secrets、environments
- 固化 upstream sync cadence

## 9. 非目标

以下方向当前都不应作为主路线：

- 把 oh-my-codex team runtime 直接塞进 CodingClaw kernel
- 把一个 loop 改造成多 story、多 agent 的长运行 session
- 用 PR 对话代替 freeze、approval 和 artifact 体系
- 在治理和审计面没稳定前，先上分布式调度、多租户队列、远程桌面复杂度

## 10. 成功标准

- 每个小 scope issue 都能稳定经过 `issue -> story -> worktree -> branch -> PR -> review -> merge -> deploy`
- 每个 loop 仍然只执行一个已批准 story，并保留独立 freeze、run、artifact set
- `main` 始终处于可审查、可发布、可追溯状态
- 团队成员可以并行协作而不共享同一个工作目录
- 公共能力和公司私有能力可以分层演进，而不破坏内核边界
- generic improvements 仍能以可控成本回推 upstream

## 建议你作为负责人优先推动的 5 件事

### 第一优先级

- 先补 `.github/CODEOWNERS`
- 先把 `verify` 补上 `merge_group`
- 先把仓库规则升到 team 级别

### 第二优先级

- 先补 runtime hardening，不要抢先上多人并发协作壳

### 第三优先级

- 确认 `codingclaw-custom` 是否真的需要独立存在
- 如果需要，就从第一天开始把“哪些必须回推 upstream”定清楚

### 第四优先级

- 固化 `story/<story-id>-<slug>` 分支命名
- 固化“一 story 一 PR”纪律

### 第五优先级

- 再去扩展 review lane、deploy lane、internal agent lane

## 参考基础

### 仓库内部依据

- [SYSTEM_BLUEPRINT.md](../SYSTEM_BLUEPRINT.md)
- [LIGHTWEIGHT_RUNTIME_PLAN.md](../LIGHTWEIGHT_RUNTIME_PLAN.md)
- [LOOP_SPEC.md](../LOOP_SPEC.md)
- [DEPLOYMENT_PLAN.md](../DEPLOYMENT_PLAN.md)
- [REVIEW_CONTRACT.en.md](../REVIEW_CONTRACT.en.md)
- [TEAM_WORKFLOW_MIGRATION_PLAN.md](./TEAM_WORKFLOW_MIGRATION_PLAN.md)

### 外部资料

- Oh My Codex documentation: https://yeachan-heo.github.io/oh-my-codex-website/docs.html
- Git protected branches: https://docs.github.com/github/administering-a-repository/about-protected-branches
- GitHub rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- GitHub CODEOWNERS: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- GitHub merge queue: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- GitHub reusable workflows: https://docs.github.com/en/actions/sharing-automations/reusing-workflows
- GitHub self-hosted runners: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners
- GitHub deployment environments: https://docs.github.com/actions/deployment/targeting-different-environments
- GitHub fork workflow: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo
- GitHub syncing a fork: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork
- Git worktree: https://git-scm.com/docs/git-worktree
