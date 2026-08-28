import { describe, expect, it } from "vitest";
import { isAllowedAsset, validatePublication, verifyManagerPin } from "./publication";

const bundle = { schemaVersion: 1, publicationId: "publication-1", publishedAt: "2026-08-27T12:00:00Z", contentFingerprint: "hash", year: { id: "year", label: "2026", status: "active" }, lenses: [], goals: [], reports: { managerReady: {}, annual: {}, categories: [], goals: [], commitment: {} }, assets: [{ id: "asset", path: "published/assets/hash.png", mimeType: "image/png", byteLength: 10 }] };

describe("published manager data", () => {
  it("accepts schema version one and declared assets", () => {
    const result = validatePublication(bundle);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isAllowedAsset(result.bundle, "published/assets/hash.png")).toBe(true);
      expect(isAllowedAsset(result.bundle, "../../private.png")).toBe(false);
    }
  });

  it("rejects unsupported and path-leaking publications", () => {
    expect(validatePublication({ ...bundle, schemaVersion: 2 })).toEqual({ ok: false, reason: "unsupported" });
    expect(validatePublication({ ...bundle, goals: [{ title: "file:///Users/example/private" }] })).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts the temporary PIN access metadata and verifies matching digits", async () => {
    const verifier = "ce643259fd1482a13e322ca0a187612227a3865f058eca8dafd47afe7d983c9e";
    const result = validatePublication({ ...bundle, access: { mode: "pin", verifier } });
    expect(result.ok).toBe(true);
    expect(await verifyManagerPin("5912", verifier)).toBe(true);
    expect(await verifyManagerPin("1234", verifier)).toBe(false);
  });
});
