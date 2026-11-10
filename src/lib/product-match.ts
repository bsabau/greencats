import { fold } from "./text";

/** Lowercase, no diacritics, punctuation turned into single spaces: "Vanelli (Fipronil )" becomes "vanelli fipronil". */
export function normalizeTerm(s: string): string {
  return fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export type Alias = { term: string; id: string };
export type Match = { productIds: string[]; clinicIds: string[]; leftover: string };

// Words that add nothing once a product or clinic is recognised: "tricat la animalia".
const FILLER = new Set(["la"]);
// Notes that say nothing about a product, so there is nothing to recognise in them.
const NOISE = new Set(["da", "nu", "yes", "no", "poli", "polivalent", "rabic", "anual", "din"]);

/**
 * Finds the products and clinics named in a free-text note. Longer names win,
 * so "nexgard combo" is NexGard Combo, not NexGard. A word is used by one name only.
 * `leftover` is what remains once the names and filler words are taken out.
 */
export function matchDescription(text: string, products: Alias[], clinics: Alias[]): Match {
  const tokens = normalizeTerm(text).split(" ").filter(Boolean);
  const used = tokens.map(() => false);
  const tagged = [...products.map((a) => ({ ...a, kind: "product" as const })), ...clinics.map((a) => ({ ...a, kind: "clinic" as const }))]
    .map((a) => ({ ...a, parts: a.term.split(" ") }))
    .sort((a, b) => b.parts.length - a.parts.length || b.term.length - a.term.length);
  const productIds = new Set<string>();
  const clinicIds = new Set<string>();
  for (const alias of tagged) {
    for (let i = 0; i + alias.parts.length <= tokens.length; i++) {
      if (!alias.parts.every((p, j) => !used[i + j] && tokens[i + j] === p)) continue;
      alias.parts.forEach((_, j) => { used[i + j] = true; });
      (alias.kind === "product" ? productIds : clinicIds).add(alias.id);
    }
  }
  return {
    productIds: [...productIds],
    clinicIds: [...clinicIds],
    leftover: tokens.filter((t, i) => !used[i] && !FILLER.has(t)).join(" "),
  };
}

/** True for notes such as "da", "05" or "anual din 2021", which name no product. */
export function isNoise(text: string): boolean {
  const tokens = normalizeTerm(text).split(" ").filter(Boolean);
  return tokens.every((t) => NOISE.has(t) || /^\d+$/.test(t));
}

/** Splits what someone typed as other spellings: commas or new lines between them. */
export function parseAliases(input: string | null | undefined): string[] {
  return [...new Set((input ?? "").split(/[,\n]/).map(normalizeTerm).filter(Boolean))];
}
