# Language Boundary Policy

## Purpose

CodingClaw uses a strict split between Chinese control language and English engineering delivery language.

## Chinese-Allowed Surfaces

Chinese is allowed only in:

- owner conversations
- approval prompts
- mobile reports and summaries
- control-plane internal notes
- planning drafts before translation into execution artifacts
- control-plane blueprint and governance records that stay outside the final engineering delivery package

## English-Required Surfaces

English is mandatory for:

- Development Plans
- Contract Freezes
- story definitions
- task packets
- handoff documents
- code files
- code comments
- repository documentation
- QA reports
- build summaries
- run summaries
- final deliverables

## Translation Rule

The control shell may accept Chinese intent, but it must translate that intent into English execution objects before any worker run begins.

Workers must never receive Chinese instructions as their primary execution contract.

## Repository Rule

Chinese content must not enter:

- code
- comments
- README files
- reports
- handoff files
- final archived delivery bundles intended for engineering consumers

## QA Enforcement

QA must check:

- repository-facing documents are in English
- generated reports are in English
- contract and traceability artifacts are in English where required
- any Chinese text is limited to approved control-plane-only surfaces

## Exceptions

Allowed exceptions are narrow:

- quoted owner input preserved inside control-plane approval records
- archived original requirement intake files stored outside final engineering delivery
- filenames or third-party assets that already contain non-English text and are out of project control

Any exception must be recorded in QA output.
