# Security and Threat Model

## Threat Model

### Defended
- **Injection**: The `renderBanner` function escapes all HTML special characters (`&`, `<`, `>`, `"`, `'`) in titles, descriptions, and category labels.
- **Data Exfiltration**: The source code contains no `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, or `new Image` calls. It is free of external network requests.
- **Configuration Tampering**: `createConsentManager` enforces strict regex patterns for category IDs and policy versions, preventing malicious configuration states.
- **Storage Tampering**: If a stored record fails to parse (e.g., due to corruption or unexpected content), the parser gracefully rejects the record and reverts to safe defaults, ensuring consistency.

### Not Defended
- This utility is a technical implementation aid for consent storage and user interface compliance; it does not protect against external JavaScript running on the same page from accessing cookies or modifying the DOM directly. It does not provide legal counsel.
