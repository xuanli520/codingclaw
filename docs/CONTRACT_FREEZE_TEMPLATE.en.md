# Contract Freeze Template

## Purpose

This document defines the required section order for `CONTRACT_FREEZE.en.md`.

## Required Section Order

### 1. Document Control

- `freeze_id`
- `freeze_version`
- `approved_at`
- `approval_card_id`

### 2. Core Objective

- approved objective
- bound project scope

### 3. Approved Architecture Direction

- architecture decision carried from the Development Plan
- non-negotiable boundaries

### 4. Baseline Binding

- `base_branch`
- `base_commit`
- dependency snapshot digest
- allowed continuation rule

### 5. Approved Execution Surface

- approved adapters
- approved run roles
- capability or sandbox limits when relevant

### 6. In-Scope Checklist

- explicit allowed work
- allowed fixback scope

### 7. Out-of-Scope Checklist

- disallowed features
- disallowed architecture changes
- deferred work

### 8. Story and Acceptance Coverage

- approved story IDs
- approved acceptance IDs
- traceability expectations

### 9. Quality Bar

- required quality threshold
- test expectations
- evidence expectations

### 10. Delivery Format

- required reports
- required metadata
- archive expectations

### 11. Language Policy

- English repository-facing requirement
- allowed Chinese control-plane surfaces

### 12. Budget and Time Guardrails

- budget limits
- timeout limits
- escalation threshold

### 13. Approval Record

- approving actor or channel
- approval timestamp
- related decision artifacts

### 14. Integrity Metadata

- freeze hash
- `contract-freeze.json` path
- `contract-freeze.sha256` path

## Stability Rule

The required headings above are normative. Supporting appendices may follow them, but they must not replace them.
