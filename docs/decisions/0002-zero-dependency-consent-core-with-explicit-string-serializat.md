# Zero-dependency consent core with explicit string serialization

Status: accepted (generated, pending human review)

## Context

Third-party CMP solutions often introduce performance penalties, tracking scripts, and complex dependency graphs. A lightweight, privacy-respecting consent manager needs to be fully transparent, deterministic, and self-contained.

## Decision

Implement the consent manager as a pure TypeScript module with zero runtime dependencies. Store consent states in a compact pipe-delimited format (v1|<version>|<epoch>|<categories>) and supply a pure string HTML renderer that enforces symmetric accept/reject semantics and accessible ARIA attributes.

## Consequences

Developers have full control over script execution and UI presentation while relying on a certified GDPR-compliant consent state model without external tracking vectors.
