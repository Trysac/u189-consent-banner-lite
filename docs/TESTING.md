# Testing Strategy

## Overview

All tests are executed via `vitest` in an isolated environment without network access. They cover core logic, serialization, accessibility, and validation.

## Test Files

- `test/index.test.ts`: Covers the entirety of the library's functionality, including:
    - `createConsentManager & storage`: Validates `needsPrompt()`, `acceptAll()`, `rejectAll()`, `save()`, and default consent values.
    - `Validation errors in createConsentManager`: Asserts that `ConsentBannerError` is thrown for invalid configs, duplicate categories, invalid policy versions, or incorrect storage implementations.
    - `cookieStorage`: Verifies cookie string construction, proper escaping, and retrieval logic, including edge cases like multiple cookies.
    - `renderBanner`: Checks for accessibility features (`role="dialog"`, `aria-labelledby`), correct markup for buttons, and HTML escaping of labels.
    - `Edge cases in stored record parsing`: Confirms graceful recovery from truncated, malformed, or mismatched stored data.
