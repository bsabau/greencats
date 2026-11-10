import { describe, expect, it } from "vitest";
import { SEED_CLINICS, SEED_PRODUCTS } from "../src/lib/catalog-seed";
import { nextDue } from "../src/lib/medical-schedule";
import { isNoise, matchDescription, normalizeTerm, parseAliases, type Alias } from "../src/lib/product-match";

const products: Alias[] = SEED_PRODUCTS.flatMap((p) => [p.name, ...p.aliases].map((a) => ({ term: normalizeTerm(a), id: p.name })));
const clinics: Alias[] = SEED_CLINICS.flatMap((c) => [c.name, ...c.aliases].map((a) => ({ term: normalizeTerm(a), id: c.name })));
const match = (text: string) => matchDescription(text, products, clinics);

describe("normalizeTerm", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizeTerm("  Vanelli (Fipronil ) ")).toBe("vanelli fipronil");
    expect(normalizeTerm("Ștefan-Văleanu")).toBe("stefan valeanu");
  });
});

describe("matchDescription", () => {
  it.each([
    ["Nexgard Combo", "NexGard Combo"],
    ["nextgard combo", "NexGard Combo"],
    ["nexgardcombo", "NexGard Combo"],
    ["Nexgard", "NexGard"],
    ["Stronghold plus", "Stronghold Plus"],
    ["stornghold", "Stronghold"],
    ["Vanelli (Fipronil)", "Fipronil"],
    ["Tricat trio", "Nobivac Tricat Trio"],
    ["changhold 1/2", "Chanhold"],
  ])("recognises %s as %s", (text, product) => {
    expect(match(text).productIds).toEqual([product]);
  });
  it("finds a product and a clinic in one note, leaving nothing over", () => {
    expect(match("Nexgard combo - Energy")).toEqual({ productIds: ["NexGard Combo"], clinicIds: ["Energy Vet"], leftover: "" });
    expect(match("Tricat (Animalia)")).toEqual({ productIds: ["Nobivac Tricat Trio"], clinicIds: ["Animalia"], leftover: "" });
  });
  it("keeps extra detail as leftover", () => {
    expect(match("Milbemax cat 4mg (1/2 tb)")).toMatchObject({ productIds: ["Milbemax"], leftover: "4mg 1 2 tb" });
    expect(match("Bravecto plus felis (la cabinet)")).toMatchObject({ productIds: ["Bravecto Plus"], leftover: "cabinet" });
  });
  it("reports two products when a note names both", () => {
    expect(match("Stronghold sau Nexgard la Animalia").productIds).toHaveLength(2);
  });
  it("recognises nothing in an unrelated note", () => {
    expect(match("nu stim cu ce")).toEqual({ productIds: [], clinicIds: [], leftover: "nu stim cu ce" });
  });
  it("does not match a name inside a longer word", () => {
    expect(match("Drontalix").productIds).toEqual([]);
  });
});

describe("the starting catalog", () => {
  it("gives every spelling to one product only", () => {
    const seen = new Map<string, string>();
    for (const a of products) {
      expect(seen.get(a.term) ?? a.id, `"${a.term}" belongs to two products`).toBe(a.id);
      seen.set(a.term, a.id);
    }
  });
  it("lists each product name once", () => {
    const names = SEED_PRODUCTS.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("isNoise and parseAliases", () => {
  it.each(["da", "05", "03.08", "Anual din", "anual, ,2021", "Poli"])("treats %s as saying nothing", (t) => expect(isNoise(t)).toBe(true));
  it.each(["Felibio", "dp", "nu stim cu ce"])("treats %s as a real note", (t) => expect(isNoise(t)).toBe(false));
  it("splits typed spellings on commas and new lines", () => {
    expect(parseAliases("Nexgrad, nex gard\nNEXGRAD,, ")).toEqual(["nexgrad", "nex gard"]);
  });
});

describe("product intervals", () => {
  it("uses the product's interval for an adult", () => {
    expect(nextDue("deworm_internal", "2026-11-01", "2020-01-01", 45)).toBe("2026-12-16");
    expect(nextDue("deworm_external", "2026-11-01", null, 90)).toBe("2027-01-30");
  });
  it("keeps the kitten series even when the product has an interval", () => {
    expect(nextDue("vaccine_polyvalent", "2026-08-31", "2026-06-15", 365)).toBe("2026-09-21");
    expect(nextDue("deworm_internal", "2026-08-31", "2026-06-15", 90)).toBe("2026-09-30");
  });
  it("falls back to the general rule without an interval", () => {
    expect(nextDue("deworm_internal", "2026-11-01", "2020-01-01", null)).toBe("2027-01-30");
  });
  it("never gives a one-off type a due date", () => {
    expect(nextDue("test_fiv_felv", "2026-11-01", null, 30)).toBeNull();
  });
});
