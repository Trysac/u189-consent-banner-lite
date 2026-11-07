/**
 * Public entry point for @trysac/consent-banner-lite.
 * Zero-dependency, tracking-free cookie consent core for browsers.
 */

/** Error codes for {@link ConsentBannerError}. */
export type ConsentBannerErrorCode = "INVALID_CONFIG" | "UNKNOWN_CATEGORY";

/**
 * Base error class for consent banner operations.
 */
export class ConsentBannerError extends Error {
  readonly code: ConsentBannerErrorCode;

  constructor(code: ConsentBannerErrorCode, message: string) {
    super(message);
    this.name = "ConsentBannerError";
    this.code = code;
    Object.setPrototypeOf(this, ConsentBannerError.prototype);
  }
}

/** Storage port interface for reading and writing consent records. */
export interface StoragePort {
  get(): string | null;
  set(value: string): void;
}

/** Configuration options for {@link createConsentManager}. */
export interface ConsentConfig {
  /**
   * Configured category IDs (regex /^[a-z][a-z0-9_]{0,31}$/).
   * 'necessary' is excluded and implicit. Maximum 10 categories.
   */
  categories: string[];
  /** Policy version identifier (regex /^[A-Za-z0-9.-]{1,32}$/). */
  policyVersion: string;
  /** Storage adapter for persistence. */
  storage: StoragePort;
  /** Clock injection returning epoch milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** Maximum age in seconds before consent expires. Defaults to 15,552,000 (180 days). */
  maxAgeSeconds?: number;
}

/** Consent manager instance. */
export interface ConsentManager {
  /** Returns a snapshot of current category consent choices. */
  get(): Record<string, boolean>;
  /** Checks whether consent prompt is required (missing, invalid, mismatched, or expired). */
  needsPrompt(): boolean;
  /** Accepts all configured categories and saves the choice. */
  acceptAll(): void;
  /** Rejects all non-necessary categories and saves the choice. */
  rejectAll(): void;
  /**
   * Merges partial or full choices into current state and saves.
   * 'necessary' always remains true.
   */
  save(choices: Record<string, boolean>): void;
  /**
   * Subscribes a listener to consent changes.
   * Listener errors are caught so other listeners continue running.
   * Returns an unsubscribe function.
   */
  onChange(fn: (c: Record<string, boolean>) => void): () => void;
}

/** Text labels for customising {@link renderBanner}. */
export interface BannerText {
  title?: string;
  description?: string;
  accept?: string;
  reject?: string;
  customize?: string;
  save?: string;
}

/** Category label configuration for {@link renderBanner}. */
export interface BannerCategory {
  id: string;
  label: string;
}

/** Banner renderer options. */
export type BannerConfig = BannerText & {
  categories: BannerCategory[];
};

const CATEGORY_ID_REGEX = /^[a-z][a-z0-9_]{0,31}$/;
const POLICY_VERSION_REGEX = /^[A-Za-z0-9.-]{1,32}$/;
const DEFAULT_MAX_AGE_SECONDS = 15_552_000; // 180 days

/**
 * Creates an in-memory storage adapter.
 */
export function memoryStorage(): StoragePort {
  let stored: string | null = null;
  return {
    get(): string | null {
      return stored;
    },
    set(value: string): void {
      stored = value;
    },
  };
}

/**
 * Creates a document cookie storage adapter.
 *
 * @param doc - Object with a string `cookie` property (e.g. `document` in browser).
 * @param name - Cookie name (defaults to 'cb_consent').
 */
export function cookieStorage(doc: { cookie: string }, name = "cb_consent"): StoragePort {
  if (!CATEGORY_ID_REGEX.test(name)) {
    throw new ConsentBannerError("INVALID_CONFIG", `Invalid cookie name: ${name.slice(0, 50)}`);
  }
  return {
    get(): string | null {
      const raw = doc.cookie;
      if (!raw || typeof raw !== "string") {
        return null;
      }
      const parts = raw.split(";");
      for (const part of parts) {
        const trimmed = part.trim();
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const k = trimmed.slice(0, eqIndex).trim();
        if (k === name) {
          const v = trimmed.slice(eqIndex + 1).trim();
          try {
            return decodeURIComponent(v);
          } catch {
            return v;
          }
        }
      }
      return null;
    },
    set(value: string): void {
      const encoded = encodeURIComponent(value);
      doc.cookie = `${name}=${encoded}; Path=/; Max-Age=${DEFAULT_MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
    },
  };
}

function validateConfig(config: ConsentConfig): void {
  if (!config || typeof config !== "object") {
    throw new ConsentBannerError("INVALID_CONFIG", "Config must be an object");
  }
  if (!Array.isArray(config.categories)) {
    throw new ConsentBannerError("INVALID_CONFIG", "categories must be an array");
  }
  if (config.categories.length > 10) {
    throw new ConsentBannerError("INVALID_CONFIG", "categories must contain at most 10 categories");
  }
  if (!POLICY_VERSION_REGEX.test(config.policyVersion)) {
    throw new ConsentBannerError(
      "INVALID_CONFIG",
      `Invalid policyVersion: ${String(config.policyVersion).slice(0, 50)}`,
    );
  }
  const seen = new Set<string>();
  for (const cat of config.categories) {
    if (typeof cat !== "string" || !CATEGORY_ID_REGEX.test(cat)) {
      throw new ConsentBannerError(
        "INVALID_CONFIG",
        `Invalid category id: ${String(cat).slice(0, 50)}`,
      );
    }
    if (cat === "necessary") {
      throw new ConsentBannerError(
        "INVALID_CONFIG",
        "'necessary' category is implicit and cannot be declared in categories list",
      );
    }
    if (seen.has(cat)) {
      throw new ConsentBannerError("INVALID_CONFIG", `Duplicate category id: ${cat}`);
    }
    seen.add(cat);
  }
  if (
    !config.storage ||
    typeof config.storage.get !== "function" ||
    typeof config.storage.set !== "function"
  ) {
    throw new ConsentBannerError("INVALID_CONFIG", "storage must implement StoragePort");
  }
  if (config.now !== undefined && typeof config.now !== "function") {
    throw new ConsentBannerError("INVALID_CONFIG", "now must be a function");
  }
  if (
    config.maxAgeSeconds !== undefined &&
    (typeof config.maxAgeSeconds !== "number" ||
      config.maxAgeSeconds <= 0 ||
      !Number.isFinite(config.maxAgeSeconds))
  ) {
    throw new ConsentBannerError("INVALID_CONFIG", "maxAgeSeconds must be a positive number");
  }
}

interface ParsedRecord {
  policyVersion: string;
  epochSeconds: number;
  choices: Record<string, boolean>;
}

function parseStoredRecord(raw: string | null, categories: readonly string[]): ParsedRecord | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  // Format: 'v1|<policyVersion>|<epoch seconds>|<id>=<0|1>,...'
  const parts = raw.split("|");
  if (parts.length < 3) {
    return null;
  }
  const [versionPrefix, policyVersion, epochStr, catSection] = parts;
  if (versionPrefix !== "v1" || !policyVersion || !epochStr) {
    return null;
  }
  const epochSeconds = Number.parseInt(epochStr, 10);
  if (Number.isNaN(epochSeconds) || epochSeconds < 0) {
    return null;
  }

  const rawPairs = (catSection ?? "").split(",").filter((s) => s.length > 0);
  if (rawPairs.length !== categories.length) {
    return null;
  }

  const choices: Record<string, boolean> = {};
  for (let i = 0; i < categories.length; i++) {
    const pair = rawPairs[i];
    if (!pair) return null;
    const eq = pair.indexOf("=");
    if (eq === -1) return null;
    const id = pair.slice(0, eq);
    const val = pair.slice(eq + 1);
    const expectedCat = categories[i];
    if (id !== expectedCat) {
      return null;
    }
    if (val === "1") {
      choices[id] = true;
    } else if (val === "0") {
      choices[id] = false;
    } else {
      return null;
    }
  }
  return { policyVersion, epochSeconds, choices };
}

function serializeRecord(
  policyVersion: string,
  epochSeconds: number,
  categories: readonly string[],
  choices: Record<string, boolean>,
): string {
  const catPairs = categories.map((cat) => `${cat}=${choices[cat] ? "1" : "0"}`).join(",");
  return `v1|${policyVersion}|${epochSeconds}|${catPairs}`;
}

/**
 * Creates a consent manager managing choices, persistence, expiry and listeners.
 */
export function createConsentManager(config: ConsentConfig): ConsentManager {
  validateConfig(config);

  const categories = Object.freeze([...config.categories]);
  const policyVersion = config.policyVersion;
  const storage = config.storage;
  const getNow = config.now ?? (() => Date.now());
  const maxAgeSeconds = config.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;

  const listeners: Set<(c: Record<string, boolean>) => void> = new Set();

  function getInitialChoices(): Record<string, boolean> {
    const initial: Record<string, boolean> = { necessary: true };
    for (const c of categories) {
      initial[c] = false;
    }
    return initial;
  }

  function readValidRecord(): ParsedRecord | null {
    const raw = storage.get();
    const parsed = parseStoredRecord(raw, categories);
    if (!parsed) {
      return null;
    }
    if (parsed.policyVersion !== policyVersion) {
      return null;
    }
    const nowSec = Math.floor(getNow() / 1000);
    // A record is expired when now - stored > maxAgeSeconds (strict)
    if (nowSec - parsed.epochSeconds > maxAgeSeconds) {
      return null;
    }
    return parsed;
  }

  let currentChoices: Record<string, boolean> = (() => {
    const valid = readValidRecord();
    if (valid) {
      return { necessary: true, ...valid.choices };
    }
    return getInitialChoices();
  })();

  function notify(): void {
    const snapshot = { ...currentChoices, necessary: true };
    for (const listener of Array.from(listeners)) {
      try {
        listener(snapshot);
      } catch {
        // Listener errors are caught and do not stop other listeners
      }
    }
  }

  function persistAndSet(nextChoices: Record<string, boolean>): void {
    const epochSeconds = Math.floor(getNow() / 1000);
    const serialized = serializeRecord(policyVersion, epochSeconds, categories, nextChoices);
    storage.set(serialized);
    currentChoices = { ...nextChoices, necessary: true };
    notify();
  }

  return {
    get(): Record<string, boolean> {
      const valid = readValidRecord();
      if (!valid) {
        // Expired, missing or invalid record returns defaults
        return getInitialChoices();
      }
      return { necessary: true, ...currentChoices };
    },

    needsPrompt(): boolean {
      return readValidRecord() === null;
    },

    acceptAll(): void {
      const next: Record<string, boolean> = { necessary: true };
      for (const cat of categories) {
        next[cat] = true;
      }
      persistAndSet(next);
    },

    rejectAll(): void {
      const next: Record<string, boolean> = { necessary: true };
      for (const cat of categories) {
        next[cat] = false;
      }
      persistAndSet(next);
    },

    save(choices: Record<string, boolean>): void {
      if (!choices || typeof choices !== "object") {
        throw new ConsentBannerError("UNKNOWN_CATEGORY", "Choices must be an object");
      }
      for (const key of Object.keys(choices)) {
        if (key !== "necessary" && !categories.includes(key)) {
          throw new ConsentBannerError(
            "UNKNOWN_CATEGORY",
            `Unknown category: ${String(key).slice(0, 50)}`,
          );
        }
      }

      const baseRecord = readValidRecord();
      const baseChoices = baseRecord ? baseRecord.choices : currentChoices;
      const next: Record<string, boolean> = { ...baseChoices };

      for (const cat of categories) {
        if (Object.hasOwn(choices, cat)) {
          next[cat] = Boolean(choices[cat]);
        } else if (next[cat] === undefined) {
          next[cat] = false;
        }
      }
      next.necessary = true;
      persistAndSet(next);
    },

    onChange(fn: (c: Record<string, boolean>) => void): () => void {
      if (typeof fn !== "function") {
        throw new ConsentBannerError("INVALID_CONFIG", "Listener must be a function");
      }
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/**
 * Escapes HTML characters (&, <, >, ", ') to prevent injection.
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

/**
 * Renders static, accessible HTML markup for the consent banner dialog.
 */
export function renderBanner(config: BannerConfig): string {
  if (!config || typeof config !== "object") {
    throw new ConsentBannerError("INVALID_CONFIG", "Config must be an object");
  }
  if (!Array.isArray(config.categories)) {
    throw new ConsentBannerError("INVALID_CONFIG", "categories must be an array");
  }
  if (config.categories.length > 10) {
    throw new ConsentBannerError("INVALID_CONFIG", "categories must contain at most 10 categories");
  }
  for (const cat of config.categories) {
    if (
      !cat ||
      typeof cat !== "object" ||
      typeof cat.id !== "string" ||
      !CATEGORY_ID_REGEX.test(cat.id)
    ) {
      throw new ConsentBannerError(
        "INVALID_CONFIG",
        `Invalid category id: ${String(cat?.id).slice(0, 50)}`,
      );
    }
    if (typeof cat.label !== "string") {
      throw new ConsentBannerError("INVALID_CONFIG", "category label must be a string");
    }
  }

  const title = escapeHtml(config.title ?? "Cookie preferences");
  const description = escapeHtml(
    config.description ??
      "We use cookies to ensure you get the best experience on our website. Essential cookies are always required.",
  );
  const acceptText = escapeHtml(config.accept ?? "Accept all");
  const rejectText = escapeHtml(config.reject ?? "Reject all");
  const customizeText = escapeHtml(config.customize ?? "Customize");
  const saveText = escapeHtml(config.save ?? "Save preferences");

  const catCheckboxes = config.categories
    .map((c) => {
      const escapedId = escapeHtml(c.id);
      const escapedLabel = escapeHtml(c.label);
      return `<div><input type="checkbox" id="cb-cat-${escapedId}" name="${escapedId}" /><label for="cb-cat-${escapedId}">${escapedLabel}</label></div>`;
    })
    .join("");

  return (
    `<div class="cb" role="dialog" aria-modal="false" aria-labelledby="cb-title" aria-describedby="cb-desc">` +
    `<h2 id="cb-title">${title}</h2>` +
    `<p id="cb-desc">${description}</p>` +
    `<div class="cb-actions">` +
    `<button type="button" class="cb-btn" data-action="accept">${acceptText}</button>` +
    `<button type="button" class="cb-btn" data-action="reject">${rejectText}</button>` +
    `<button type="button" class="cb-btn" data-action="customize">${customizeText}</button>` +
    `</div>` +
    `<fieldset class="cb-details" hidden>` +
    `<legend>Cookie Categories</legend>` +
    `<div><input type="checkbox" id="cb-cat-necessary" name="necessary" checked disabled /><label for="cb-cat-necessary">Necessary</label></div>` +
    catCheckboxes +
    `<button type="button" class="cb-btn" data-action="save">${saveText}</button>` +
    `</fieldset>` +
    `</div>`
  );
}
