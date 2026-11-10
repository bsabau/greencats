import { describe, expect, it } from "vitest";
import {
  containsPhone,
  nameKey,
  normalizePhone,
  parseDeathEntry,
  parsePhones,
  splitAnimalList,
  splitAnimalName,
  testResult,
} from "../src/lib/import-helpers";

describe("phones", () => {
  it.each([
    ["740000101", "+40740000101"],
    ["0740000102", "+40740000102"],
    ["(0740) 000 103", "+40740000103"],
    ["33639980104", "+33639980104"],
    ["33(0)639980105", "+33639980105"],
    ["(+33) 0639980106", "+33639980106"],
    ["40 740 000 107", "+40740000107"],
    ["33 6 39 98 01 08", "+33639980108"],
  ])("%s", (raw, expected) => expect(normalizePhone(raw)).toBe(expected));

  it("handles several numbers and drops labels", () => {
    expect(parsePhones("33639980109\n+33639980110 (colega)")).toEqual(["+33639980109", "+33639980110"]);
  });
  it("handles a numeric cell", () => expect(parsePhones(740000111)).toEqual(["+40740000111"]));
  it("spots a phone inside a name", () => {
    expect(containsPhone("pisoiul fara ureche - Ion Popescu (0740000112)")).toBe(true);
    expect(containsPhone("pui Lola 4")).toBe(false);
  });
});

describe("animal names", () => {
  it("removes descriptions from the key", () => expect(nameKey("Nova (baietel negru) ")).toBe("nova"));
  it("ignores diacritics", () => expect(nameKey("Bobită")).toBe("bobita"));
  it("splits slash aliases", () => {
    expect(splitAnimalName("Eryon/Haru")).toEqual({ name: "Eryon", aliases: ["Haru"] });
  });
  it("uses a single word in parentheses as an alias", () => {
    expect(splitAnimalName("Steff (Sugar)")).toEqual({ name: "Steff", aliases: ["Sugar"] });
  });
  it("does not treat a description as an alias", () => {
    expect(splitAnimalName("Nova (baietel negru)")).toEqual({ name: "Nova", aliases: [] });
  });
  it("leaves long case descriptions whole", () => {
    const raw = "pisoiul muscat de caini/incontinent (la energyvet) - Maria pop";
    expect(splitAnimalName(raw).name).toBe(raw);
  });
  it.each([
    ["Amira, Bobita", ["Amira", "Bobita"]],
    ["Macrou & Bartolomeu", ["Macrou", "Bartolomeu"]],
    ["Cora si Callie", ["Cora", "Callie"]],
    ["blondutu & negrutu & nitro", ["blondutu", "negrutu", "nitro"]],
    ["Babiliuta*", ["Babiliuta"]],
    ["(Thor)", ["Thor"]],
  ])("lists %s", (raw, expected) => expect(splitAnimalList(raw)).toEqual(expected));
});

describe("death entries", () => {
  it("reads name, cause and date", () => {
    expect(parseDeathEntry("Mica - insuficienta renala - 06.10.2025")).toEqual({
      name: "Mica",
      date: { date: "2025-10-06", precision: "day" },
      note: "insuficienta renala",
    });
  });
  it("reads a date placed before the cause", () => {
    const e = parseDeathEntry("Ivar 25.03.2023; accident masina");
    expect(e.name).toBe("Ivar");
    expect(e.date?.date).toBe("2023-03-25");
    expect(e.note).toBe("accident masina");
  });
  it("keeps a multi-word name", () => {
    expect(parseDeathEntry("Baby catu 13 Iunie 2022 abandonat la nastere").name).toBe("Baby catu");
  });
});

describe("test results", () => {
  it.each([
    ["2025.09.15 neg", "negative"],
    ["2026.08.31 FIV/Felv negativ", "negative"],
    ["poz 25.04.2024", "positive"],
    ["2025.12.02 ?", null],
  ])("%s", (raw, expected) => expect(testResult(raw)).toBe(expected));
});
