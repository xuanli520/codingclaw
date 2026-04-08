# Approval Card Specification

## Purpose

Approval cards are the control-plane objects used to present decisions to the owner on mobile or chat channels.

## Card Types

CodingClaw should support at least:

- plan approval cards
- contract freeze approval cards
- change request approval cards
- high-risk action approval cards
- recovery cards

## Required Fields

Every approval card must include:

- `job_id`
- `card_id`
- `card_type`
- `story_id` when applicable
- `freeze_version` when applicable
- `risk_level`
- `summary_zh`
- `requested_action`
- `candidate_actions`
- `timeout_at`
- `created_at`
- `evidence_refs`

## Candidate Actions

Every card must provide explicit actions such as:

- approve
- reject
- request revision
- pause job
- trigger takeover

Later cards must not overwrite the decision context of an earlier pending card.

## Presentation Rules

- the summary must be understandable on mobile
- the risk level must be visible without opening attachments
- evidence links must point to archived artifacts or stable views
- the owner should see what will happen next after each action

## Recovery Card Requirements

A recovery card must include:

- last exit reason
- current freeze version
- current story
- latest evidence path
- recommended next action

## Timeout Behavior

When a card expires:

- the underlying execution stays paused
- no default approval is assumed
- the job moves to an awaiting-owner state
