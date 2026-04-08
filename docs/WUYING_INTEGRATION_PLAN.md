# Wuying Integration Plan

## Purpose

This document defines how Aliyun Wuying Desktop fits into CodingClaw as a GUI exception and human takeover surface.

Official feasibility references for this positioning are collected in [OFFICIAL_REFERENCE_NOTES.md](OFFICIAL_REFERENCE_NOTES.md).

## Positioning

Wuying is not the primary builder environment. It exists for:

- GUI-only workflows
- Windows-only tools
- human takeover
- remote assistance

## Preferred Order of Use

1. API or management SDK control
2. web bridge access
3. human takeover
4. assisted GUI operation

## Integration Components

The integration should define:

- Wuying session provisioning or lookup
- takeover packet generation following `TAKEOVER_PACKET_TEMPLATE.en.md`
- secure access handoff
- result collection
- resume signal back into the control shell

## Control Rules

- Wuying access must be explicitly approved
- main loop execution must transition into `AWAITING_TAKEOVER` during takeover unless the task is explicitly parallel-safe
- all takeover results must be written back under `artifacts/runs/<run_id>/takeover/` and referenced by handoff and manifest records

## Phase Plan

### Phase 1

- no active Wuying automation
- only reserve document hooks and policy definitions
- keep Wuying limited to approved takeover and remote assistance paths
- do not depend on undocumented Wuying-native orchestration for resume control

### Phase 2

- managed takeover packet format and archive path
- stable resume semantics

### Phase 3

- controlled bridge integration
- assisted GUI support

## Non-Goals

- using Wuying as the default coding environment
- replacing Docker workers with desktop sessions
- turning GUI automation into the main execution path
