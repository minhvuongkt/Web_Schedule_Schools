import { describe, expect, it } from "vitest";

import { alertKey, shouldShowAlert } from "@/components/notifications/alert-state";

describe("alertKey", () => {
  it("is order-independent and stable", () => {
    expect(alertKey(["b", "a"])).toBe(alertKey(["a", "b"]));
    expect(alertKey([])).toBe("");
  });
});

describe("shouldShowAlert", () => {
  it("hides when there is nothing unread", () => {
    expect(shouldShowAlert([], null)).toBe(false);
    expect(shouldShowAlert([], "a|b")).toBe(false);
  });

  it("shows for unread notifications that were not dismissed", () => {
    expect(shouldShowAlert(["a"], null)).toBe(true);
    expect(shouldShowAlert(["a", "b"], alertKey(["a"]))).toBe(true);
  });

  it("stays hidden while the same unread set is dismissed", () => {
    expect(shouldShowAlert(["a", "b"], alertKey(["b", "a"]))).toBe(false);
  });

  it("re-shows when a new notification arrives after a dismissal", () => {
    const dismissed = alertKey(["a", "b"]);
    expect(shouldShowAlert(["a", "b", "c"], dismissed)).toBe(true);
  });
});
