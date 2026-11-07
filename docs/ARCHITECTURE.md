# Architecture

## System Architecture

`@trysac/consent-banner-lite` is designed as a standalone, zero-dependency client-side library for managing consent preferences.

### Components

1. **ConsentManager (`createConsentManager`)**:
   - Manages consent states (`Record<string, boolean>`).
   - Treats `necessary` as always `true` and implicit.
   - Checks for consent expiry (`maxAgeSeconds`, default 180 days) and policy version changes.
   - Encodes and parses persistence records.
   - Notifies subscribers via `onChange`.

2. **Storage Adapters (`StoragePort`)**:
   - `memoryStorage()`: In-memory store for server-side environments or testing.
   - `cookieStorage(doc, name)`: First-party cookie storage targeting browser environments (`Path=/; Max-Age=15552000; SameSite=Lax; Secure`).

3. **Banner Renderer (`renderBanner`)**:
   - Pure function returning HTML strings with WAI-ARIA dialog attributes.
   - Escapes HTML entities (`&`, `<`, `>`, `"`, `'`) in titles, descriptions, and category labels.
   - Presents symmetric "Accept all" and "Reject all" actions alongside a customizable category panel.

## Stored Format Specification

Format string:
```
v1|<policyVersion>|<epoch_seconds>|<cat1>=<0|1>,<cat2>=<0|1>...
```

- Prefix: `v1`
- Categories are serialized strictly in the order defined in `ConsentConfig.categories`.
- Any parsing failure, unknown version prefix, corrupted epoch, or category set mismatch causes `needsPrompt()` to return `true` and `get()` to return safe defaults (all categories disabled except `necessary`).
