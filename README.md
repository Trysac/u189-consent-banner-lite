# consent-banner-lite

[![npm version](https://img.shields.io/npm/v/@trysac/consent-banner-lite.svg)](https://www.npmjs.com/package/@trysac/consent-banner-lite)
[![license: MIT](https://img.shields.io/npm/l/@trysac/consent-banner-lite.svg)](LICENSE)
[![CI](https://github.com/Trysac/u189-consent-banner-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u189-consent-banner-lite/actions/workflows/ci.yml)

Tracking-free cookie consent core for the browser: opt-in by default, equal accept and reject buttons, accessible static markup and an exact cookie format

## Problem

Describe in two or three sentences the concrete problem this utility solves, who hits it, and why existing
packages do not solve it well. Keep it factual; link to an issue or decision record when there is one.

## Install

```sh
npm install @trysac/consent-banner-lite
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations.

## Usage

```ts
import { greet } from "@trysac/consent-banner-lite";

// Build a greeting; surrounding whitespace is ignored.
const message = greet("  Ada ");
console.log(message); // "Hello, Ada!"

try {
  greet("   ");
} catch (error) {
  console.error((error as Error).message); // "name must not be empty"
}
```

## API

| Export | Signature | Description |
|---|---|---|
| `greet` | `(name: string) => string` | Placeholder API; replace it with the real one. |

## Development

```sh
npm install
npm run check   # lint, format, types, tests with coverage, docs, secrets
```

See [AGENTS.md](AGENTS.md) for the full command list and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

[MIT](LICENSE) © 2026 Miguel Gomez
