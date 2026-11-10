/** Far longer than any real note (the longest so far is about 3,000 characters). Anything beyond is cut. */
export const MAX_TEXT = 20_000;
/** For names, titles and e-mail addresses. */
export const MAX_NAME = 200;

export const text = (fd: FormData, key: string, max = MAX_TEXT): string | null => {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  return v.trim().slice(0, max).trim() || null;
};

export const date = (fd: FormData, key: string): string | null => {
  const v = text(fd, key);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

export function oneOf<T extends string>(fd: FormData, key: string, allowed: readonly T[], fallback: T): T {
  const v = fd.get(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export const uuid = (fd: FormData, key: string): string | null => {
  const v = text(fd, key);
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
};

export const time = (fd: FormData, key: string): string | null => {
  const v = text(fd, key);
  return v && /^\d{2}:\d{2}$/.test(v) ? v : null;
};

export const int = (fd: FormData, key: string, min: number, max: number): number | null => {
  const n = Number(text(fd, key));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
