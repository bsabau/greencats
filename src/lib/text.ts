/** Lowercases and removes diacritics, so "Ștefan" is found by typing "stefan". */
export function fold(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
