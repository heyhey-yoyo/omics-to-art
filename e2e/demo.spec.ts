import { expect, test } from "@playwright/test";

test("expression demo reaches the studio and exposes all export formats", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /表达矩阵示例/ }).click();
  await expect(page.getByText("Data Passport")).toBeVisible();
  await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SVG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manifest" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ZIP 全套/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("differential demo selects Differential Bloom", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /差异花园示例/ }).click();
  await expect(page.getByRole("button", { name: /Differential Bloom/ })).toHaveClass(/active/);
  await expect(page.getByText(/统计结果由用户或原始分析流程提供/)).toBeVisible();
});
