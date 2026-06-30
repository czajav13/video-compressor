import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";
import { qualityToCrf } from "./compression";

describe("formatBytes", () => {
  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("qualityToCrf", () => {
  it("lowers CRF as quality increases", () => {
    const lowQuality = qualityToCrf(20);
    const highQuality = qualityToCrf(80);

    expect(highQuality).toBeLessThan(lowQuality);
  });

  it("maps slider bounds to expected CRF bounds", () => {
    expect(qualityToCrf(1)).toBe(36);
    expect(qualityToCrf(55)).toBe(30);
    expect(qualityToCrf(100)).toBe(18);
  });
});
