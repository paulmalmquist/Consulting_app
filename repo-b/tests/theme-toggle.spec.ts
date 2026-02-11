import { test, expect } from "@playwright/test";

test.describe("Theme Toggle", () => {
  test("homepage renders theme toggle and switches to dark", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    // Click dark mode
    await page.getByTestId("theme-dark").click();

    // Document should have dark class
    const htmlClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(htmlClass).toBe(true);
  });

  test("theme preference persists across reload", async ({ page }) => {
    await page.goto("/");

    // Set to light
    await page.getByTestId("theme-light").click();
    const lightClass = await page.evaluate(() =>
      document.documentElement.classList.contains("light")
    );
    expect(lightClass).toBe(true);

    // Reload
    await page.reload();

    // Wait for mount
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    // Should still be light after reload
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem("theme")
    );
    expect(storedTheme).toBe("light");
  });

  test("light button shows active state when selected", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-light").click();

    const pressed = await page.getByTestId("theme-light").getAttribute("aria-pressed");
    expect(pressed).toBe("true");

    const darkPressed = await page.getByTestId("theme-dark").getAttribute("aria-pressed");
    expect(darkPressed).toBe("false");
  });
});
