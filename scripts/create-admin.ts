/** Creates the first admin account: npm run create-admin -- <email> "<name>" "<temporary password>" */
import { hash } from "@node-rs/argon2";
import { db, pg, schema as s } from "../src/db";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 12) {
  throw new Error('Usage: npm run create-admin -- <email> "<name>" "<temporary password, 12+ characters>"');
}
await db.insert(s.users).values({
  email: email.toLowerCase(),
  name,
  passwordHash: await hash(password),
  role: "admin",
  mustChangePassword: true,
});
console.log(`Admin ${email} created. They must change the password at first login.`);
await pg.end();
