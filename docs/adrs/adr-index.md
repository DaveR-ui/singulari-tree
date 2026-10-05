---
id: adr-index
category: adrs
tags: [adr, hub, index]
aliases: [ADR Index, ADR List]
related: [adr-0014-docs-corpus-layout, adr-0015-docs-validator-generated-index, adr-0016-lane-state-and-graph-dod, adr-0017-docs-language-en, adr-0018-renderer-i18n-locale-switch]
version: 1.2.1
status: active
---

# ADRs — Index

## What belongs here

**Structural or schema** decisions of this corpus: layout, note contract, validator, generated indexes. Append-only: an accepted ADR is not edited; if the decision changes, a successor is written with `supersedes`.

## Contents

- [[adr-0014-docs-corpus-layout]] — adopt the documentation-onrails corpus (`docs/` as root, `docs/project.md` as entry point).
- [[adr-0015-docs-validator-generated-index]] — custom zero-dependency validator + generated indexes with marker regions.
- [[adr-0016-lane-state-and-graph-dod]] — per-repo lane state in `GraphService` + graph DoD scoped to vertical columns (edge parity deferred).
- [[adr-0017-docs-language-en]] — adopt English as the documentation corpus language (supersedes ADR-0014 item 7).
- [[adr-0018-renderer-i18n-locale-switch]] — renderer i18n with an EN/ES locale switch via runtime `$localize` (English default).

## Elsewhere

ADR-001..ADR-013 live embedded in `docs/context/git-client/decisions.md` (legacy — see `accepted-debt.md`). Numbering continues at **ADR-014**.
