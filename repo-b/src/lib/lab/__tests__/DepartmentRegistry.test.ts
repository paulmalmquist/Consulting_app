import { describe, expect, it } from "vitest";
import { LAB_DEPARTMENTS } from "../DepartmentRegistry";

describe("DepartmentRegistry", () => {
  it("has unique department keys", () => {
    const keys = LAB_DEPARTMENTS.map((dept) => dept.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes accounting with icon and order", () => {
    const accounting = LAB_DEPARTMENTS.find((dept) => dept.key === "accounting");
    expect(accounting).toBeTruthy();
    expect(accounting?.icon).toBe("calculator");
    expect(accounting?.order).toBeTypeOf("number");
  });
});
