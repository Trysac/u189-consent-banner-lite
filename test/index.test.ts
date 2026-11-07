import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConsentBannerError,
  cookieStorage,
  createConsentManager,
  memoryStorage,
  renderBanner,
} from "../src/index.js";

describe("createConsentManager & storage", () => {
  it("manager created with categories ['analytics', 'marketing'], policyVersion '2026-01-01' and memoryStorage() has needsPrompt() === true and get() deep-equals { necessary: true, analytics: false, marketing: false }", () => {
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
    });

    expect(manager.needsPrompt()).toBe(true);
    expect(manager.get()).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("rejectAll() with the clock at Date.parse('2026-11-06T10:00:00Z') stores exactly 'v1|2026-01-01|1793959200|analytics=0,marketing=0', after which needsPrompt() === false", () => {
    const storage = memoryStorage();
    const epochMs = Date.parse("2026-11-06T10:00:00Z");
    expect(epochMs / 1000).toBe(1793959200);

    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
      now: () => epochMs,
    });

    manager.rejectAll();
    expect(storage.get()).toBe("v1|2026-01-01|1793959200|analytics=0,marketing=0");
    expect(manager.needsPrompt()).toBe(false);
    expect(manager.get()).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("save({ analytics: true }) gives { necessary: true, analytics: true, marketing: false }; save({ necessary: false }) keeps necessary true; save({ ads: true }) throws ConsentBannerError with code 'UNKNOWN_CATEGORY'", () => {
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
      now: () => 1700000000000,
    });

    manager.save({ analytics: true });
    expect(manager.get()).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });

    manager.save({ necessary: false });
    expect(manager.get().necessary).toBe(true);

    expect(() => manager.save({ ads: true })).toThrowError(ConsentBannerError);
    try {
      manager.save({ ads: true });
    } catch (err) {
      expect(err).toBeInstanceOf(ConsentBannerError);
      expect((err as ConsentBannerError).code).toBe("UNKNOWN_CATEGORY");
    }
  });

  it("needsPrompt() is true when the stored policy version differs, when the record is 15_552_001 seconds old and when the stored value is 'garbage' (get() then returns the defaults), and false when the record is exactly 15_552_000 seconds old", () => {
    const nowSeconds = 1800000000;
    const storage = memoryStorage();

    const create = () =>
      createConsentManager({
        categories: ["analytics", "marketing"],
        policyVersion: "2026-01-01",
        storage,
        now: () => nowSeconds * 1000,
        maxAgeSeconds: 15_552_000,
      });

    // Differing policy version
    storage.set("v1|2025-01-01|1800000000|analytics=1,marketing=1");
    const mDiff = create();
    expect(mDiff.needsPrompt()).toBe(true);
    expect(mDiff.get()).toEqual({ necessary: true, analytics: false, marketing: false });

    // 15_552_001 seconds old (strictly expired)
    storage.set(`v1|2026-01-01|${nowSeconds - 15_552_001}|analytics=1,marketing=1`);
    const mExpired = create();
    expect(mExpired.needsPrompt()).toBe(true);
    expect(mExpired.get()).toEqual({ necessary: true, analytics: false, marketing: false });

    // Exactly 15_552_000 seconds old (not expired)
    storage.set(`v1|2026-01-01|${nowSeconds - 15_552_000}|analytics=1,marketing=1`);
    const mExact = create();
    expect(mExact.needsPrompt()).toBe(false);
    expect(mExact.get()).toEqual({ necessary: true, analytics: true, marketing: true });

    // Garbage record
    storage.set("garbage");
    const mGarbage = create();
    expect(mGarbage.needsPrompt()).toBe(true);
    expect(mGarbage.get()).toEqual({ necessary: true, analytics: false, marketing: false });
  });

  it("acceptAll saves all categories to true", () => {
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
      now: () => 1700000000000,
    });

    manager.acceptAll();
    expect(storage.get()).toBe("v1|2026-01-01|1700000000|analytics=1,marketing=1");
    expect(manager.get()).toEqual({ necessary: true, analytics: true, marketing: true });
    expect(manager.needsPrompt()).toBe(false);
  });

  it("onChange listeners receive the new choices once per save, acceptAll or rejectAll, and no file in src contains 'fetch(', 'XMLHttpRequest', 'sendBeacon' or 'new Image('", () => {
    // Check that listeners receive new choices once per save, acceptAll, or rejectAll
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
    });

    const calls: Array<Record<string, boolean>> = [];
    const unlisten = manager.onChange((c) => {
      calls.push(c);
    });

    // Faulty listener to verify isolation
    manager.onChange(() => {
      throw new Error("Listener boom");
    });

    manager.save({ analytics: true });
    manager.acceptAll();
    manager.rejectAll();

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ necessary: true, analytics: true, marketing: false });
    expect(calls[1]).toEqual({ necessary: true, analytics: true, marketing: true });
    expect(calls[2]).toEqual({ necessary: true, analytics: false, marketing: false });

    // Test unlisten
    unlisten();
    manager.save({ analytics: true });
    expect(calls).toHaveLength(3);

    // Verify literal absence in src
    const srcDir = path.resolve(__dirname, "../src");
    const srcFiles = fs.readdirSync(srcDir);
    const forbidden = ["fetch(", "XMLHttpRequest", "sendBeacon", "new Image("];
    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(srcDir, file), "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toContain(pattern);
      }
    }
  });

  it("propagates storage errors if storage.set throws", () => {
    const throwingStorage = {
      get: () => null,
      set: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const manager = createConsentManager({
      categories: ["analytics"],
      policyVersion: "2026-01-01",
      storage: throwingStorage,
    });

    expect(() => manager.acceptAll()).toThrow("QuotaExceededError");
  });
});

describe("Validation errors in createConsentManager", () => {
  it("rejects category id 'Bad-Id' or more than 10 categories with code 'INVALID_CONFIG'", () => {
    const storage = memoryStorage();

    expect(() =>
      createConsentManager({
        categories: ["Bad-Id"],
        policyVersion: "2026-01-01",
        storage,
      }),
    ).toThrowError(ConsentBannerError);

    try {
      createConsentManager({
        categories: ["Bad-Id"],
        policyVersion: "2026-01-01",
        storage,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConsentBannerError);
      expect((err as ConsentBannerError).code).toBe("INVALID_CONFIG");
    }

    const elevenCategories = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11"];
    expect(() =>
      createConsentManager({
        categories: elevenCategories,
        policyVersion: "2026-01-01",
        storage,
      }),
    ).toThrowError(ConsentBannerError);
  });

  it("rejects invalid configurations (duplicate categories, necessary category, invalid policy, etc.)", () => {
    const storage = memoryStorage();

    // @ts-expect-error test invalid config
    expect(() => createConsentManager(null)).toThrow(ConsentBannerError);
    expect(() =>
      // @ts-expect-error test invalid config
      createConsentManager({ categories: "not-array", policyVersion: "1.0", storage }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      createConsentManager({ categories: ["necessary"], policyVersion: "1.0", storage }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      createConsentManager({ categories: ["cat", "cat"], policyVersion: "1.0", storage }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      createConsentManager({
        categories: ["analytics"],
        policyVersion: "invalid policy version!",
        storage,
      }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      // @ts-expect-error invalid storage
      createConsentManager({ categories: ["analytics"], policyVersion: "1.0", storage: {} }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      createConsentManager({
        categories: ["analytics"],
        policyVersion: "1.0",
        storage,
        // @ts-expect-error invalid now
        now: 12345,
      }),
    ).toThrow(ConsentBannerError);
    expect(() =>
      createConsentManager({
        categories: ["analytics"],
        policyVersion: "1.0",
        storage,
        maxAgeSeconds: -5,
      }),
    ).toThrow(ConsentBannerError);
  });

  it("rejects non-object choices in save and non-function listeners in onChange", () => {
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics"],
      policyVersion: "1.0",
      storage,
    });
    // @ts-expect-error invalid choices
    expect(() => manager.save(null)).toThrow(ConsentBannerError);
    // @ts-expect-error invalid listener
    expect(() => manager.onChange("not-fn")).toThrow(ConsentBannerError);
  });
});

describe("cookieStorage", () => {
  it("cookieStorage(doc).set(v) assigns doc.cookie = 'cb_consent=' + encodeURIComponent(v) + '; Path=/; Max-Age=15552000; SameSite=Lax; Secure', and get() reads the value from 'a=1; cb_consent=...' and returns null when absent", () => {
    const doc = { cookie: "" };
    const store = cookieStorage(doc);

    const valueToStore = "v1|2026-01-01|1793959200|analytics=0,marketing=0";
    store.set(valueToStore);
    expect(doc.cookie).toBe(
      `cb_consent=${encodeURIComponent(valueToStore)}; Path=/; Max-Age=15552000; SameSite=Lax; Secure`,
    );

    // Simulate reading with multiple cookies
    doc.cookie = `a=1; cb_consent=${encodeURIComponent(valueToStore)}; user=jane`;
    expect(store.get()).toBe(valueToStore);

    // Absent
    doc.cookie = "a=1; b=2; user=john";
    expect(store.get()).toBeNull();
  });

  it("handles cookie edge cases: spaces, equal signs in values, empty cookie, and malformed encoding", () => {
    const doc = { cookie: "" };
    const store = cookieStorage(doc, "my_cookie");

    // Empty doc.cookie
    expect(store.get()).toBeNull();

    // Cookie with equal signs in value
    doc.cookie = "other=foo; my_cookie=val%3Dwith%3Dequals; third=baz";
    expect(store.get()).toBe("val=with=equals");

    // Malformed URI encoding falls back gracefully
    doc.cookie = "my_cookie=%E0%A4%A";
    expect(store.get()).toBe("%E0%A4%A");

    // Invalid cookie name throws
    expect(() => cookieStorage(doc, "Invalid-Name")).toThrow(ConsentBannerError);
  });
});

describe("renderBanner", () => {
  it('renderBanner(config) contains \'role="dialog"\', \'aria-labelledby="cb-title"\', \'id="cb-title"\', \'<button type="button" class="cb-btn" data-action="accept">Accept all</button>\' and \'<button type="button" class="cb-btn" data-action="reject">Reject all</button>\' (same class, both in the first layer), and the necessary checkbox has \'checked disabled\'', () => {
    const html = renderBanner({
      categories: [
        { id: "analytics", label: "Analytics" },
        { id: "marketing", label: "Marketing" },
      ],
    });

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="cb-title"');
    expect(html).toContain('id="cb-title"');
    expect(html).toContain(
      '<button type="button" class="cb-btn" data-action="accept">Accept all</button>',
    );
    expect(html).toContain(
      '<button type="button" class="cb-btn" data-action="reject">Reject all</button>',
    );
    expect(html).toContain("checked disabled");
    expect(html).toContain('id="cb-cat-necessary"');
    expect(html).toContain('for="cb-cat-necessary"');
    expect(html).toContain('id="cb-cat-analytics"');
    expect(html).toContain('for="cb-cat-analytics"');
  });

  it("A title '<b>x</b>' renders as '&lt;b&gt;x&lt;/b&gt;'; a category id 'Bad-Id' or more than 10 categories throw code 'INVALID_CONFIG'", () => {
    const html = renderBanner({
      title: "<b>x</b>",
      description: "desc with 'quote' & \"double\"",
      categories: [{ id: "analytics", label: "Analytics & Metrics" }],
    });

    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("Analytics &amp; Metrics");
    expect(html).toContain("&#39;quote&#39; &amp; &quot;double&quot;");

    expect(() =>
      renderBanner({
        categories: [{ id: "Bad-Id", label: "Bad" }],
      }),
    ).toThrowError(ConsentBannerError);

    try {
      renderBanner({
        categories: [{ id: "Bad-Id", label: "Bad" }],
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ConsentBannerError);
      expect((err as ConsentBannerError).code).toBe("INVALID_CONFIG");
    }

    const eleven = Array.from({ length: 11 }, (_, i) => ({
      id: `cat_${i}`,
      label: `Category ${i}`,
    }));
    expect(() => renderBanner({ categories: eleven })).toThrowError(ConsentBannerError);
  });

  it("validates renderBanner inputs and handles custom texts & unicode labels", () => {
    // @ts-expect-error invalid input
    expect(() => renderBanner(null)).toThrow(ConsentBannerError);
    // @ts-expect-error invalid categories
    expect(() => renderBanner({ categories: "not-an-array" })).toThrow(ConsentBannerError);
    // @ts-expect-error invalid category item
    expect(() => renderBanner({ categories: [{ id: "valid_id", label: 123 }] })).toThrow(
      ConsentBannerError,
    );

    const html = renderBanner({
      title: "Paramètres de confidentialité",
      description: "Gestion des traceurs et témoins.",
      accept: "Tout accepter",
      reject: "Tout refuser",
      customize: "Personnaliser",
      save: "Enregistrer mes choix",
      categories: [{ id: "analytics", label: "Mesure d'audience" }],
    });

    expect(html).toContain("Paramètres de confidentialité");
    expect(html).toContain("Tout accepter");
    expect(html).toContain("Tout refuser");
    expect(html).toContain("Personnaliser");
    expect(html).toContain("Enregistrer mes choix");
    expect(html).toContain("Mesure d&#39;audience");
  });
});

describe("Edge cases in stored record parsing", () => {
  it("handles truncated, malformed epoch, or mismatched categories in storage", () => {
    const storage = memoryStorage();
    const manager = createConsentManager({
      categories: ["analytics", "marketing"],
      policyVersion: "2026-01-01",
      storage,
      now: () => 1700000000000,
    });

    // Truncated
    storage.set("v1|2026-01-01");
    expect(manager.needsPrompt()).toBe(true);

    // Unknown version prefix
    storage.set("v2|2026-01-01|1700000000|analytics=1,marketing=1");
    expect(manager.needsPrompt()).toBe(true);

    // Invalid epoch
    storage.set("v1|2026-01-01|not-a-number|analytics=1,marketing=1");
    expect(manager.needsPrompt()).toBe(true);

    // Mismatched category length
    storage.set("v1|2026-01-01|1700000000|analytics=1");
    expect(manager.needsPrompt()).toBe(true);

    // Mismatched category ID order or name
    storage.set("v1|2026-01-01|1700000000|marketing=1,analytics=1");
    expect(manager.needsPrompt()).toBe(true);

    // Invalid boolean flag in category pair
    storage.set("v1|2026-01-01|1700000000|analytics=2,marketing=0");
    expect(manager.needsPrompt()).toBe(true);

    // Malformed pair without equals
    storage.set("v1|2026-01-01|1700000000|analytics-1,marketing=0");
    expect(manager.needsPrompt()).toBe(true);
  });
});
