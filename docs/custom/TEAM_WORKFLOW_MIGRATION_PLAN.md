# Team Workflow Migration Plan

## Purpose

This document defines the recommended path to move CodingClaw from a prompt2repo-style solo development workflow into a team collaboration workflow without breaking the current Phase 1 kernel.

The target is not to replace the current control shell and loop model with an external multi-agent runtime. The target is to preserve the current contract-first, artifact-first, short-loop kernel and add a collaboration shell around it for issue intake, worktree isolation, PR review, merge governance, and deployment.

## Executive Decision

CodingClaw should adopt a two-layer operating model:

- keep the current `Development Plan -> Contract Freeze -> one-story loop -> Builder -> QA -> archive` kernel as the execution core
- add a GitHub-centered collaboration shell around the kernel for issue routing, worktree isolation, branch governance, PR review, merge control, and deployment gates
- run two independent CodingClaw deployments when team scale or trust boundaries require it
- allow a `codingclaw-custom` fork for company-specific workflow policy, private adapters, internal agent systems, and deployment rules

This is the best fit because the current repository explicitly keeps the loop kernel small and auditable, and explicitly avoids importing an external product shell, team runtime, memory layer, or orchestration stack into the core runtime.

## Current-State Findings

### Boundaries To Preserve

- `docs/SYSTEM_BLUEPRINT.md` defines non-negotiable operating rules: plan before code, freeze before execution, one story per loop, files over memory, Builder and QA separation, and English repository-facing deliverables.
- `docs/LOOP_SPEC.md` defines a single-story, short-lived, auditable loop and does not allow one run to merge multiple independent stories.
- `docs/LIGHTWEIGHT_RUNTIME_PLAN.md` explicitly says CodingClaw should borrow ideas from oh-my-codex and IronClaw, but must not import their full shell, team runtime, or orchestration stack into the core runtime.
- `docs/DEPLOYMENT_PLAN.md` keeps the supported runtime small: one control host, Docker workers, one Ubuntu GUI surface, and no distributed complexity in Phase 1.

### Existing Assets To Reuse

- `.github/ISSUE_TEMPLATE/` already provides structured issue intake.
- `.github/pull_request_template.md` already asks for scope, contract impact, verification, evidence, and risks.
- `.github/workflows/verify.yml` already provides a base required verification workflow.
- `.github/workflows/enforce-repo-gate.yml` and `scripts/github_repo_gate.py` already bootstrap repository protection.
- `docs/REVIEW_CONTRACT.en.md` already defines an independent review role and can be promoted into a real PR review lane.
- `state/`, `task-packet`, `run-result`, `artifact-index`, `handoff`, and checksum conventions already provide the audit substrate required for team work.

### Gaps To Close

- repository protection is still closer to solo development than team governance because `scripts/github_repo_gate.py` does not require PR reviews or CODEOWNERS approval
- the live path still ends at QA and does not yet provide a first-class review, merge, or deploy lane
- the current runtime plan still treats atomic state writes, scoped state, capability enforcement, and shell/credential guards as hardening work rather than mandatory team-concurrency controls
- there is no first-class contract for `issue -> branch -> PR -> review -> merge -> deploy`

## External Research Summary

### Oh My Codex

- the public documentation positions `Ralph` as the persistence loop that continues until completion and architect verification
- the public documentation positions `Team` as a conductor-led execution layer with explicit planning, execution, verification, and fix phases
- the public documentation recommends isolated worktree-based team execution and a workflow that handles parallel issues through separate branches and PRs

Implication:

- CodingClaw should use `Ralph` as the close-out loop for one approved story
- CodingClaw should use team or worktree-based parallelism outside the kernel, not inside one loop run

### GitHub

- rulesets and protected branches are the correct place for branch interaction policy, required checks, review requirements, linear history, and merge restrictions
- CODEOWNERS is the correct path-based ownership model, and owner review only works when the file exists on the PR base branch
- merge queue is the correct solution once multiple PRs contend for the same protected branch, and CI must support `merge_group`
- reusable workflows are the correct abstraction for repeatable multi-job PR, verify, and deploy lanes
- self-hosted runners are the correct boundary when the team needs custom runtime, internal network access, or heavyweight agent systems
- deployment environments are the correct boundary for staged secrets, required reviewers, and promotion gates
- fork PRs are the correct collaboration boundary for a public upstream plus a private company fork, but workflow and secrets changes from forks must be treated as high risk

Implication:

- CodingClaw should put team policy into GitHub repository governance instead of trying to encode all collaboration logic inside the loop runtime

## Recommended Target Operating Model

## 1. Kernel And Shell Split

Keep the current CodingClaw kernel unchanged in responsibility:

- intake normalization
- development plan approval
- contract freeze binding to `base_commit`
- one-story execution
- Builder execution
- QA validation
- artifact archival

Move team collaboration concerns into a separate shell:

- issue triage
- story slicing
- worktree creation
- branch naming
- PR creation
- review assignment
- merge queue entry
- environment promotion
- upstream or fork synchronization

This split preserves current repository intent and avoids mixing prompt execution concerns with organization-level workflow governance.

## 2. Default Work Unit

The default unit of team work should be:

- one GitHub issue
- one story queue derived from that issue when the issue is larger than one story
- one approved story per execution branch
- one isolated worktree per active story
- one freeze, one run, and one artifact set per story
- one PR per story by default

The loop kernel must still execute one story at a time. Team throughput comes from multiple isolated worktrees and PRs in parallel, not from enlarging one loop. If one issue expands into multiple stories, split it before execution and let each story run through its own freeze, run, artifacts, review, and merge path.

## 3. Recommended Branch Topology

Use this structure by default in `codingclaw-custom`:

- `main`: release and archive branch, strongest protection, merge queue enabled
- `dev`: integration branch for team issue PRs, required verification, required review, no direct pushes
- `story/<story-id>-<slug>`: short-lived branch created from `dev`
- `hotfix/<id>-<slug>`: emergency fixes, merged back into `main` and `dev`
- `sync/upstream-<date>`: short-lived branch used only to bring upstream changes into `codingclaw-custom`

Why this topology:

- `dev` absorbs frequent small-scope issue PRs without destabilizing `main`
- `main` remains the promotion target with the strictest release and deploy gates
- upstream sync remains explicit and reviewable

Use this structure in the public upstream by default:

- `main`: the only long-lived branch, strongly protected
- short-lived feature or fix branches only

Add `dev` to the public upstream only if upstream PR concurrency becomes high enough to justify a dedicated integration branch and merge queue.

## 4. Recommended Daily Workflow

### Intake And Planning

- open a GitHub issue using the existing issue forms
- convert the issue into a story queue when necessary
- execute only one approved story per branch and per loop
- produce or update `DEVELOPMENT_PLAN.en.md`
- approve the plan
- generate or update `CONTRACT_FREEZE.en.md` and freeze artifacts

### Implementation

- create a dedicated worktree from `dev` for one approved story
- run `Ralph` for that single story scope
- keep all local execution evidence attached to the run artifact set
- require the worktree to stay single-purpose

### Review

- open a PR from `story/<story-id>-<slug>` into `dev`
- require `verify`
- require at least one independent review
- require CODEOWNERS approval for touched paths
- run an explicit review lane based on `docs/REVIEW_CONTRACT.en.md`

### Merge And Promotion

- merge into `dev` through merge queue
- run integration verification on `dev`
- promote from `dev` to `main` through a release PR
- require deployment environment approval before production release

### Handoff And Recovery

- if work pauses mid-issue, checkpoint the run state and preserve the artifact trail
- if takeover is required, use the existing takeover packet and approval card model instead of ad hoc chat handoff

## 5. Oh My Codex Role Mapping

Use oh-my-codex outside the kernel in this shape:

- `ralplan`: convert issue scope into a bounded execution plan when the issue is ambiguous or cross-cutting
- `team`: coordinate multiple parallel issues or multiple bounded lanes when the work naturally splits
- `ralph`: drive one story-scoped branch until implementation, verification, and architect-style sign-off are complete
- `review`: run a pre-landing review pass against the PR diff
- `ship`: push branch and create the PR
- `checkpoint`: preserve and resume team worktrees cleanly during interruptions
- `trace`: inspect multi-agent execution history when a run or review lane becomes hard to explain

Operating rule:

- `Ralph` owns completion for one approved story
- `Team` owns parallelism across issues
- GitHub owns merge and deploy governance

## 6. GitHub Governance Changes

### Repository Rules

Replace the current minimal gate with branch rules or rulesets that enforce at least:

- required status checks
- required conversation resolution
- required linear history
- force-push disabled
- branch deletion disabled
- required pull request before merge
- at least one approving review and required CODEOWNERS review on `dev`
- at least two approvals and required CODEOWNERS review on `main`
- stale review dismissal on new commits
- CODEOWNERS review on owned paths

`scripts/github_repo_gate.py` can remain as a bootstrap script, but it should no longer be the only policy surface.

### CODEOWNERS

Add a real `.github/CODEOWNERS` file and map at least:

- `core/` to loop kernel owners
- `control/` to control shell owners
- `adapters/` to adapter owners
- `ops/` to runtime and policy owners
- `.github/` to platform owners
- `docs/` to contract owners

### Merge Queue

Enable merge queue on `dev` and later on `main` when PR concurrency justifies it.

Required follow-up:

- update `.github/workflows/verify.yml` to run on `merge_group` in addition to `push` and `pull_request`

### Reusable Workflows

Split the current workflow surface into reusable units:

- `_verify.yml`
- `_review-lane.yml`
- `_deploy.yml`
- `_repo-governance.yml`

Then let repository workflows call those modules with pinned references.

### Deployment Environments

Create at least:

- `staging`
- `production`

Use them for:

- environment-specific secrets
- required reviewers
- deployment promotion gates
- branch restrictions
- trusted-branch-only production access

### Runners

Use two runner classes:

- GitHub-hosted runners for normal repository verification
- self-hosted or ephemeral runners for heavy backend agent integration, GUI automation, internal systems, or private network dependencies

Trust boundary rules:

- fork PRs run GitHub-hosted, read-only, minimum verification only
- fork PRs must not reach self-hosted runners
- fork PRs must not access protected deployment environments
- changes under `.github/workflows/**` must be reviewed and merged into a trusted branch before any private runner or protected environment can execute them
- production environments accept deployments from trusted protected branches only

Recommended labels:

- `codingclaw-build`
- `codingclaw-qa`
- `codingclaw-review`
- `codingclaw-agent`

## 7. Dual Deployment Strategy

When the team needs both public evolution and private company customization, run two independent CodingClaw deployments:

### Deployment A: Upstream Or Public Baseline

- tracks the canonical repository
- stays close to public contracts and generic capabilities
- uses public-safe workflows and public-safe secrets only
- serves as the clean upstream for broadly useful features
- defaults to protected `main` only unless upstream throughput later justifies `dev`

### Deployment B: Company Collaboration Stack

- runs against `codingclaw-custom`
- contains company-only adapters, workflow rules, internal backend agent integrations, and deployment policies
- uses self-hosted runners and private secrets
- integrates with internal systems that should never exist in the public baseline

### Fork Policy

Use `codingclaw-custom` only for changes that are truly company-specific:

- private adapters
- private skill or policy wrappers
- internal deployment integrations
- internal approval and audit hooks
- company-specific `.github/` automation

Push generic improvements upstream whenever possible:

- contract clarifications
- runtime hardening
- generic review lane logic
- generic runner abstractions
- generic governance improvements

This minimizes long-term fork drag.

## 8. Implementation Roadmap

### Phase 0: Governance Baseline

- add `.github/CODEOWNERS`
- upgrade repository rules beyond the current `github_repo_gate.py` baseline
- add `merge_group` support to verification
- define ownership for `.github/`, `docs/`, `core/`, `control/`, `ops/`, and `adapters/`

### Phase 1: Runtime Hardening Baseline

- finish atomic state writes
- finish scoped state resolution
- enforce capability deny-by-default
- finish shell and credential guards

This phase is the safety floor before parallel team execution expands.

### Phase 2: Team Shell

- define the formal mapping from issue to story to branch to PR
- add worktree discipline for every active issue
- standardize branch naming and PR metadata
- define when to use `Ralph` and when to use `Team`

### Phase 3: Review And Merge Lane

- turn `docs/REVIEW_CONTRACT.en.md` into a real review lane
- require independent review evidence before merge
- wire release promotion from `dev` to `main`

### Phase 4: Dual Deployment

- stand up the private `codingclaw-custom` line if needed
- separate public and private workflows, runners, secrets, and environments
- document upstream sync cadence

## 9. Non-Goals

- importing oh-my-codex team runtime directly into the CodingClaw kernel
- turning one loop into a multi-story multi-agent long-running session
- replacing freeze and approval artifacts with PR discussion alone
- adding distributed schedulers, multi-tenant queues, or cloud desktop complexity before governance and audit paths are stable

## 10. Success Criteria

- every small-scope issue can move through `issue -> story -> worktree -> branch -> PR -> review -> merge -> deploy` without ad hoc process
- each loop still executes exactly one approved story with its own freeze, run, and artifact set
- `main` is always protected, reviewable, and releasable
- team members can collaborate in parallel without sharing the same working tree
- public and private automation can diverge without corrupting the core kernel
- generic improvements can still flow upstream with manageable fork maintenance cost

## Source Basis

### Repository Evidence

- [SYSTEM_BLUEPRINT.md](../SYSTEM_BLUEPRINT.md)
- [LIGHTWEIGHT_RUNTIME_PLAN.md](../LIGHTWEIGHT_RUNTIME_PLAN.md)
- [LOOP_SPEC.md](../LOOP_SPEC.md)
- [DEPLOYMENT_PLAN.md](../DEPLOYMENT_PLAN.md)
- [REVIEW_CONTRACT.en.md](../REVIEW_CONTRACT.en.md)
- [../.github/pull_request_template.md](../../.github/pull_request_template.md)
- [../.github/workflows/verify.yml](../../.github/workflows/verify.yml)
- [../scripts/github_repo_gate.py](../../scripts/github_repo_gate.py)

### External References

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
