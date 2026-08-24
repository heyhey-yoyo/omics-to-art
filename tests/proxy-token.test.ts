import { describe, expect, it } from "vitest";
import { signProxyUrl, verifyProxyToken } from "../worker/src/proxy-token";

const keyMaterial = "test-key-material-".repeat(3);
const url = "https://ftp.ncbi.nlm.nih.gov/geo/series/GSE1nnn/GSE1000/matrix/GSE1000_series_matrix.txt.gz";

describe("signed GEO proxy tokens", () => {
  it("round-trips with an unambiguous path-safe delimiter", async () => {
    const token = await signProxyUrl(url, keyMaterial, 1_000, 1_800);
    expect(token.split(".")).toHaveLength(2);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(verifyProxyToken(token, keyMaterial, 2_000)).resolves.toBe(url);
  });

  it("rejects tampering, a wrong secret, and expired tokens", async () => {
    const token = await signProxyUrl(url, keyMaterial, 1_000, 100);
    await expect(verifyProxyToken(`${token}x`, keyMaterial, 1_050)).resolves.toBeNull();
    await expect(verifyProxyToken(token, `${keyMaterial}x`, 1_050)).resolves.toBeNull();
    await expect(verifyProxyToken(token, keyMaterial, 1_101)).resolves.toBeNull();
  });
});
