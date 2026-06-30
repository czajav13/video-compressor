import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";
import { normalizeCrf } from "./compression";

describe("formatBytes", () => {
  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("normalizeCrf", () => {
  it("keeps valid CRF values", () => {
    expect(normalizeCrf(30)).toBe(30);
    expect(normalizeCrf(18.4)).toBe(18);
  });

  it("clamps CRF to ffmpeg bounds", () => {
    expect(normalizeCrf(-2)).toBe(0);
    expect(normalizeCrf(60)).toBe(51);
    expect(normalizeCrf(Number.NaN)).toBe(30);
  });
});
