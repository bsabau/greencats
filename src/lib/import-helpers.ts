import { extractDate, fold, type FuzzyDate } from "./dates";

/** Comparison key for names: no case, diacritics, parentheses, or doubled spaces. */
export function nameKey(raw: string): string {
  return fold(raw).replace(/\([^)]*\)?/g, " ").replace(/[*?!]/g, " ").replace(/\s+/g, " ").trim();
}

/** `Eryon/Haru` becomes Eryon + Haru; `Steff (Sugar)` becomes Steff + Sugar. Long descriptions stay whole. */
export function splitAnimalName(raw: string): { name: string; aliases: string[] } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.split(" ").length > 6) return { name: clean, aliases: [] };
  const aliases: string[] = [];
  const noParens = clean
    .replace(/\(([^)]*)\)?/g, (_, inner: string) => {
      const value = inner.trim();
      if (value && !value.includes(" ")) aliases.push(value);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  const [name, ...others] = noParens.split("/").map((s) => s.trim()).filter(Boolean);
  return { name: name || clean, aliases: [...others, ...aliases] };
}

/** Splits a cell naming several cats, such as `Amira, Bobita` or `Macrou & Bartolomeu`. */
export function splitAnimalList(raw: string): string[] {
  return raw
    .replace(/\([^)]*\)?/g, (m) => (m.includes(" ") ? " " : m.replace(/[()]/g, " ")))
    .split(/\s*(?:&|,|\+|;|\n)\s*|\s+(?:si|și)\s+/i)
    .map((s) => s.replace(/[*?]/g, "").trim())
    .filter(Boolean);
}

/** Puts a phone in international form. Numbers it cannot place are returned unchanged. */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/\(0\)/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 9) return raw.trim();
  const international = (cc: string, rest: string) => `+${cc}${rest.replace(/^0/, "")}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("33") && digits.length >= 11) return international("33", digits.slice(2));
  if (digits.startsWith("40") && digits.length >= 11) return international("40", digits.slice(2));
  if (digits.startsWith("0") && digits.length === 10) return `+40${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) return `+40${digits}`;
  return cleaned.trim().startsWith("+") ? `+${digits}` : digits;
}

export function parsePhones(value: string | number | Date | null | undefined): string[] {
  if (value === null || value === undefined || value === "" || value instanceof Date) return [];
  if (typeof value === "number") return [normalizePhone(String(Math.trunc(value)))];
  return [
    ...new Set(
      value
        .split(/\n|\/|;/)
        .map((part) => part.replace(/\([a-zA-Zăâîșț ]+\)/g, "").trim())
        .filter((part) => /\d{3}/.test(part))
        .map(normalizePhone),
    ),
  ];
}

export function containsPhone(text: string): boolean {
  return /(?:\+?\d[\s.-]?){9,}/.test(text);
}

/** Reads a "Cat Heaven" line such as `Mica - insuficienta renala - 06.10.2025`. */
export function parseDeathEntry(raw: string): { name: string; date: FuzzyDate | null; note: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  const name = text.split(/\s*[-–;:,]\s*|\s+(?=\d)/)[0].trim();
  const afterName = text.slice(name.length);
  const found = extractDate(afterName);
  const note = (found ? found.rest : afterName).replace(/^[\s\-–;:,]+|[\s\-–;:,]+$/g, "");
  return { name, date: found ? { date: found.date, precision: found.precision } : null, note };
}

export function testResult(text: string): "positive" | "negative" | null {
  const t = fold(text);
  if (/\bneg/.test(t)) return "negative";
  if (/\bpoz|\bpos/.test(t)) return "positive";
  return null;
}
