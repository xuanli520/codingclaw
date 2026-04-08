# Wuying Integration Plan

## Purpose

This document defines how Aliyun Wuying Desktop fits into CodingClaw as a GUI exception and human takeover surface.

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
- takeover packet generation
- secure access handoff
- result collection
- resume signal back into the control shell

## Control Rules

- Wuying access must be explicitly approved
- main loop execution pauses during takeover unless the task is explicitly parallel-safe
- all takeover results must be written back as artifacts and handoff records

## Phase Plan

### Phase 1

- no active Wuying automation
- only reserve document hooks and policy definitions

### Phase 2

- managed takeover packet format
- stable resume semantics

### Phase 3

- controlled bridge integration
- assisted GUI support

## Non-Goals

- using Wuying as the default coding environment
- replacing Docker workers with desktop sessions
- turning GUI automation into the main execution path
