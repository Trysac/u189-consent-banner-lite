# Project Record

## Objective
Provide a privacy-first, tracking-free browser cookie consent core with opt-in defaults and symmetric reject capabilities.

## Scope
- Consent state management (`Record<string, boolean>`).
- Persistence via `cookieStorage` or `memoryStorage`.
- Accessible HTML banner generation.
- Subscription mechanism for consent changes.
- Strict validation of configuration and user input.

## Out-of-Scope
- Script blocking or tag management.
- IAB TCF strings.
- IP Geolocation.
- Custom CSS visual theming.
- User tracking or analytics.

## Factory run u189 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4397 | 12341 | 0 | 0 | 0.0248 |
| fix-1 | gemini-3.8-flash | no | 29019 | 1091 | 0 | 77487 | 0.0317 |
| fix-2 | gemini-3.8-flash | no | 25305 | 239 | 0 | 31900 | 0.0223 |
| fix-3 | gemini-3.8-flash | no | 56871 | 1131 | 0 | 342019 | 0.0725 |
| audit | gemini-3.1-flash-lite | no | 40992 | 409 | 0 | 87463 | 0.0130 |
| fix-4 | gemini-3.8-flash | no | 55578 | 728 | 0 | 319609 | 0.0684 |
| docs | gemini-3.1-flash-lite | no | 14354 | 1364 | 0 | 0 | 0.0056 |

Total: $0.2383. Prices: Anthropic list prices.
