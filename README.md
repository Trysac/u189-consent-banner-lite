# @trysac/consent-banner-lite

Tracking-free cookie consent core for the browser: opt-in by default, equal accept and reject buttons, accessible static markup, and an exact cookie format.

[![Build Status](https://github.com/Trysac/u189-consent-banner-lite/workflows/ci/badge.svg)](https://github.com/Trysac/u189-consent-banner-lite/actions)

## The Problem

Most cookie banners are third-party scripts that track the visitor before consent, hide the reject option, and are not keyboard or screen reader friendly. Small sites only need to remember a few categories and render an honest choice. This library provides the consent state, its storage format, and accessible banner markup without any network access. It is a technical aid, not legal advice.

## Installation

```bash
npm install @trysac/consent-banner-lite
```

## Usage Example

```typescript
import { createConsentManager, cookieStorage, renderBanner } from "@trysac/consent-banner-lite";
const manager = createConsentManager({ categories: ["analytics"], policyVersion: "2026-01-01", storage: cookieStorage(document) });
if (manager.needsPrompt()) {
  document.body.insertAdjacentHTML("beforeend", renderBanner({ categories: [{ id: "analytics", label: "Analytics" }] }));
}
manager.onChange((c) => { if (c.analytics) console.log("Analytics allowed"); });
```

## Public API Summary

- `createConsentManager(config: ConsentConfig): ConsentManager`: Initializes state management.
- `ConsentConfig`: Requires `categories` (regex `/^[a-z][a-z0-9_]{0,31}$/`, max 10, 'necessary' is implicit), `policyVersion` (regex `/^[A-Za-z0-9.-]{1,32}$/`), and `storage` (StoragePort). Optional `now` (epoch ms) and `maxAgeSeconds` (default 15,552,000).
- `ConsentManager`: Methods `get()`, `needsPrompt()`, `acceptAll()`, `rejectAll()`, `save(choices)`, `onChange(listener)`.
- `cookieStorage(doc, name?)`: Browser-compatible storage.
- `memoryStorage()`: In-memory storage.
- `renderBanner(config)`: Returns HTML string.
- `ConsentBannerError`: Thrown for `INVALID_CONFIG` or `UNKNOWN_CATEGORY`.

## Why not existing CMPs?

Unlike hosted CMPs, this library has no third-party dependencies, performs no tracking, and is tiny enough to be fully testable without external network calls.

See [docs/SECURITY.md](docs/SECURITY.md) for security details.
