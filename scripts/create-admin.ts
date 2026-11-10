/**
 * Creates the first admin account: npm run create-admin -- <email> "<name>"
 * The temporary password is typed when asked, or piped in, so it never shows in the shell
 * history or the process list.
 */
import { hash } from "@node-rs/argon2";
import { db, pg, schema as s } from "../src/db";

const USAGE = 'Usage: npm run create-admin -- <email> "<name>", then type the temporary password (12+ characters) when asked.';

/** Reads one line without showing it when typed, or the first line of piped input. */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    return input.split(/\r?\n/)[0].trim();
  }
  process.stdout.write("Temporary password (12+ characters, not shown): ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  let typed = "";
  for await (const chunk of process.stdin as AsyncIterable<string>) {
    for (const char of chunk) {
      if (char === "\u0003") {
        // Ctrl-C: give the terminal back as it was before leaving.
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        return typed.trim();
      }
      typed = char === "\u007f" || char === "\b" ? typed.slice(0, -1) : typed + char;
    }
  }
  return typed.trim();
}

const [email, name, extra] = process.argv.slice(2);
if (extra !== undefined) throw new Error(`The password is no longer given on the command line. ${USAGE}`);
if (!email?.includes("@") || !name) throw new Error(USAGE);
const password = await readPassword();
if (password.length < 12 || password.length > 1000) throw new Error("The password must have 12 to 1000 characters.");
await db.insert(s.users).values({
  email: email.toLowerCase(),
  name,
  passwordHash: await hash(password),
  role: "admin",
  mustChangePassword: true,
});
console.log(`Admin ${email} created. They must change the password at first login.`);
await pg.end();
