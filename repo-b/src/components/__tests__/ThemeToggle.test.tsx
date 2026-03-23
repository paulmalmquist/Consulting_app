import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ThemeToggle from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "";
    document.documentElement.style.colorScheme = "";
    mockMatchMedia(false);
  });

  test("toggles theme immediately and persists it", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const user = userEvent.setup();

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(screen.getByTestId("theme-icon-moon")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });
    expect(screen.getByTestId("theme-icon-sun")).toBeInTheDocument();
  });

  test("falls back to system preference when no theme is stored", async () => {
    mockMatchMedia(true);

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId("theme-icon-sun")).toBeInTheDocument();
  });
});
