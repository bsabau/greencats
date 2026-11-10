import { describe, expect, it } from "vitest";
import { loginLimit, passwordChangeBlocked, recordLoginFailure, recordLoginSuccess, recordPasswordChangeFailure } from "../src/lib/login-limits";

const fail = (email: string, ip: string, times: number) => {
  for (let i = 0; i < times; i++) recordLoginFailure(email, ip);
};

describe("login limits", () => {
  it("blocks one address that keeps guessing one account", () => {
    fail("a@x.ro", "10.0.0.1", 8);
    expect(loginLimit("a@x.ro", "10.0.0.1")).toBe("blocked");
    expect(loginLimit("a@x.ro", "10.0.0.2")).toBe("ok");
  });

  it("blocks one address that tries many accounts", () => {
    for (let i = 0; i < 40; i++) recordLoginFailure(`user${i}@x.ro`, "10.0.1.1");
    expect(loginLimit("someone@x.ro", "10.0.1.1")).toBe("blocked");
  });

  it("lets the account owner in from a known address while guesses come from everywhere", () => {
    recordLoginSuccess("admin@x.ro", "10.0.2.1");
    for (let i = 0; i < 30; i++) recordLoginFailure("admin@x.ro", `10.9.${i}.1`);
    expect(loginLimit("admin@x.ro", "10.0.2.1")).toBe("known_only");
    expect(loginLimit("admin@x.ro", "10.0.2.99")).toBe("blocked");
  });

  it("keeps the counters of an attacked account when the table is flooded", () => {
    fail("target@x.ro", "10.0.3.1", 7);
    for (let i = 0; i < 25_000; i++) recordLoginFailure(`flood${i}@x.ro`, `10.${(i >> 8) & 255}.${i & 255}.2`);
    recordLoginFailure("target@x.ro", "10.0.3.1");
    expect(loginLimit("target@x.ro", "10.0.3.1")).toBe("blocked");
  });

  it("limits wrong current passwords when changing the password", () => {
    for (let i = 0; i < 4; i++) recordPasswordChangeFailure("user-1");
    expect(passwordChangeBlocked("user-1")).toBe(false);
    recordPasswordChangeFailure("user-1");
    expect(passwordChangeBlocked("user-1")).toBe(true);
    expect(passwordChangeBlocked("user-2")).toBe(false);
  });
});
