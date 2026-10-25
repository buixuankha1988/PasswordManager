export type PasswordGenOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
};

export const DEFAULT_PASSWORD_GEN: PasswordGenOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
};

const SYMBOLS = "~!@#$%^&*+-/.,?";

function randomInt(max: number): number {
  if (max <= 0) return 0;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pickChar(from: string): string {
  return from[randomInt(from.length)]!;
}

export function generatePassword(opts: PasswordGenOptions): string {
  let pool = "";
  if (opts.upper) pool += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (opts.lower) pool += "abcdefghijklmnopqrstuvwxyz";
  if (opts.digits) pool += "0123456789";
  if (opts.symbols) pool += SYMBOLS;
  if (!pool) {
    pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  }

  const length = Math.min(64, Math.max(8, Math.round(opts.length)));
  const required: string[] = [];
  if (opts.upper) required.push(pickChar("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  if (opts.lower) required.push(pickChar("abcdefghijklmnopqrstuvwxyz"));
  if (opts.digits) required.push(pickChar("0123456789"));
  if (opts.symbols) required.push(pickChar(SYMBOLS));

  const chars = [...required];
  while (chars.length < length) {
    chars.push(pickChar(pool));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export type PasswordStrength = "yếu" | "trung bình" | "mạnh";

export function passwordStrengthLabel(pw: string): PasswordStrength {
  if (pw.length < 8) return "yếu";
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return "yếu";
  if (score <= 4) return "trung bình";
  return "mạnh";
}
