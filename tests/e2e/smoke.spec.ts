import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Full run against a stack holding imported data. Needs an admin created with
 * create-admin, passed as E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.
 * It adds test records, so run it on a local stack only.
 */
const adminEmail = process.env.E2E_ADMIN_EMAIL!;
const firstPassword = process.env.E2E_ADMIN_PASSWORD!;
const run = Date.now();
const adminPassword = `Admin-${run}-password`;
const volunteer = { email: `qa-vol-${run}@greencats.local`, password: `Volunteer-${run}-pw`, next: `Volunteer-${run}-new` };
const coordinator = { email: `qa-coord-${run}@greencats.local`, password: `Coordinator-${run}-pw`, next: `Coordinator-${run}-new` };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Intră în cont"), button:has-text("Sign in")');
}
async function firstLogin(page: Page, email: string, password: string, next: string) {
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/account/);
  await page.fill('input[name="current"]', password);
  await page.fill('input[name="next"]', next);
  await page.locator('input[name="next"]').press("Enter");
  await expect(page.getByRole("status")).toBeVisible();
}
function watchFailures(page: Page) {
  const failures: string[] = [];
  page.on("response", (r) => { if (r.status() >= 500) failures.push(`${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => failures.push(e.message));
  // Anything the content security policy blocks would mean a broken page.
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) failures.push(m.text()); });
  return failures;
}

test.describe.configure({ mode: "serial" });

test("only the page's own scripts may run", async ({ page }) => {
  const failures = watchFailures(page);
  const response = await page.goto("/login");
  const csp = response!.headers()["content-security-policy"];
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  // A new nonce for every page view, so an attacker can't reuse one.
  const again = (await page.request.get("/login")).headers()["content-security-policy"];
  expect(again).not.toContain(nonce!);
  // Every script in the page carries it. Browsers hide the attribute value, so the property is read.
  const nonces = await page.locator("script").evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
  expect(nonces.length).toBeGreaterThan(0);
  expect(nonces.every((n) => n === nonce)).toBe(true);
  expect(failures).toEqual([]);
});

test("anonymous visitors get nothing", async ({ page, request }) => {
  await page.goto("/animals");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get("/export/animals")).status()).toBe(401);
  expect((await request.get("/export/report/period?format=csv&table=monthly")).status()).toBe(401);
  expect((await request.get("/photos/00000000-0000-0000-0000-000000000000")).status()).toBe(401);
});

test("wrong password is refused", async ({ page }) => {
  await signIn(page, adminEmail, "not-the-password");
  await expect(page.locator('.toast-in[role="alert"]')).toBeVisible();
});

test("admin full journey", async ({ page }) => {
  const failures = watchFailures(page);
  await firstLogin(page, adminEmail, firstPassword, adminPassword);

  for (const person of [
    { ...volunteer, name: "QA Voluntar", role: "volunteer" },
    { ...coordinator, name: "QA Coordonator", role: "coordinator" },
  ]) {
    await page.goto("/admin/users");
    const form = page.locator('form:has(input[name="email"])');
    await form.locator('input[name="name"]').fill(person.name);
    await form.locator('input[name="email"]').fill(person.email);
    await form.locator('input[name="password"]').fill(person.password);
    await form.locator('select[name="role"]').selectOption(person.role);
    await form.locator("button").click();
    await expect(page.getByRole("status")).toBeVisible();
  }

  for (const path of ["/", "/animals", "/people", "/calendar", "/calendar?m=2026-07&type=foster_logistics", "/adoptions", "/visibility", "/reports", "/reports/period", "/reports/period?preset=last_year&species=cat&sex=f", "/reports/medical", "/review", "/admin/audit", "/admin/privacy", "/admin/lists"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }

  // Two shelter locations, added on the Lists page.
  const locA = `QA Loc A ${run}`;
  const locB = `QA Loc B ${run}`;
  const locationRow = (loc: string) => page.locator("li").filter({ has: page.locator("summary", { hasText: loc }) });
  for (const loc of [locA, locB]) {
    await page.goto("/admin/lists");
    await page.click('summary:has-text("Locație nouă")');
    const form = page.locator('details:has(summary:has-text("Locație nouă")) form');
    await form.locator('input[name="name"]').fill(loc);
    await form.locator("button").click();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(locationRow(loc)).toContainText("0 animale acum");
  }

  // A new cat starts in the shelter, at the location chosen.
  await page.goto("/animals/new");
  const name = `QA Pisica ${run}`;
  await expect(page.locator('select[name="status"]')).toHaveValue("in_shelter");
  await page.locator('select[name="locationId"]').selectOption({ label: locB });
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="birthDate"]', "2022-03-01");
  await page.click('button:has-text("Salvează")');
  await expect(page.locator("h1")).toHaveText(name);
  await expect(page.locator("main section").first()).toContainText(`La ${locB}`);
  const catPage = page.url().split("?")[0];

  // Merging B into A moves the cat; the animals page gets a tab for A.
  await page.goto("/admin/lists");
  await locationRow(locB).locator("summary").click();
  await locationRow(locB).locator('select[name="targetId"]').selectOption({ label: locA });
  await locationRow(locB).locator('button:has-text("Unește")').click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(locationRow(locB)).toHaveCount(0);
  await expect(locationRow(locA)).toContainText("un animal acum");
  await page.goto("/animals");
  await page.getByRole("button", { name: new RegExp(`La ${locA}`) }).click();
  await expect(page.locator("main li a")).toHaveCount(1);
  await expect(page.locator("main li a")).toContainText(name);

  // An inactive location is still shown for the cat already there, but not offered for new cats.
  await page.goto("/admin/lists");
  await locationRow(locA).locator("summary").click();
  await locationRow(locA).locator('input[name="active"]').uncheck();
  await locationRow(locA).locator('button:has-text("Salvează")').click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(locationRow(locA)).toContainText("Inactiv");
  await page.goto("/animals/new");
  await expect(page.locator(`select[name="locationId"] option:has-text("${locA}")`)).toHaveCount(0);
  await page.goto(catPage);
  await page.click('button:has-text("Schimbă statutul")');
  const toPlace = page.locator("dialog[open] form");
  await expect(toPlace.locator('select[name="locationId"]')).toHaveValue(/.+/);
  await expect(toPlace.locator(`select[name="locationId"] option:has-text("${locA}")`)).toHaveCount(1);
  // Moving to another place in the shelter; the location field is only there for "in the shelter".
  await toPlace.locator('select[name="locationId"]').selectOption({ label: "Căsuță" });
  await toPlace.locator('button:has-text("Salvează")').click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator("main section").first()).toContainText("La Căsuță");
  // "In the shelter" without a place is refused, even when the browser's check is bypassed.
  await page.click('button:has-text("Schimbă statutul")');
  await page.locator('dialog[open] select[name="locationId"]').evaluate((el) => {
    const select = el as HTMLSelectElement;
    select.required = false;
    select.value = "";
  });
  await page.locator('dialog[open] button:has-text("Salvează")').click();
  await expect(page.locator('.toast-in[role="alert"]')).toContainText("Alegeți locul din adăpost");
  await expect(page.locator("main section").first()).toContainText("La Căsuță");
  await page.click('button:has-text("Schimbă statutul")');
  await page.locator('dialog[open] select[name="status"]').selectOption("clinic");
  await expect(page.locator('dialog[open] select[name="locationId"]')).toHaveCount(0);
  await page.locator("dialog[open]").press("Escape");

  // A status needing a person is refused without one.
  await page.click('button:has-text("Schimbă statutul")');
  const moveForm = page.locator('dialog[open] form');
  await moveForm.locator('select[name="status"]').selectOption("foster");
  await expect(moveForm.locator('input[role="combobox"]')).toBeVisible();
  await moveForm.locator('button:has-text("Salvează")').click();
  await expect(page.locator('.toast-in[role="alert"]')).toBeVisible();

  // An adult's vaccine gets a due date a year later, shown on the record.
  await page.click('button:has-text("Adaugă înregistrare medicală")');
  const medical = page.locator('dialog[open] form');
  await medical.locator('select[name="kind"]').selectOption("vaccine_rabies");
  await medical.locator('input[name="date"]').fill("2026-11-01");
  await medical.locator('button:has-text("Salvează")').click();
  await expect(page.locator("#medical")).toContainText("2027");

  // A product with its own interval sets the next due date of a record that uses it.
  const productName = `QA Produs ${run}`;
  const catUrl = page.url().split("?")[0];
  await page.goto("/admin/lists");
  await page.click('summary:has-text("Produs nou")');
  const productForm = page.locator('form:has(input[name="intervalDays"])').first();
  await productForm.locator('input[name="name"]').fill(productName);
  await productForm.locator('input[name="kinds"][value="deworm_internal"]').check();
  await productForm.locator('input[name="intervalDays"]').fill("45");
  await productForm.locator('input[name="aliases"]').fill(`qa-alias-${run}`);
  await productForm.locator("button").click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator("main")).toContainText(productName);
  await page.goto(`${catUrl}?tab=medical`);
  await page.click('button:has-text("Adaugă înregistrare medicală")');
  const withProduct = page.locator("dialog[open] form");
  await withProduct.locator('select[name="kind"]').selectOption("deworm_internal");
  await withProduct.locator('select[name="productId"]').selectOption({ label: productName });
  await expect(withProduct.locator('select[name="result"]')).toHaveCount(0);
  await withProduct.locator('select[name="clinicId"]').selectOption({ label: "Echovet" });
  await withProduct.locator('input[name="date"]').fill("2026-11-01");
  await withProduct.locator('button:has-text("Salvează")').click();
  // The current-status card names the product too; the history row also carries the clinic.
  await expect(page.locator("#medical li", { hasText: productName }).first()).toBeVisible();
  const productRow = page.locator("#medical li", { hasText: productName }).filter({ hasText: "Echovet" });
  await expect(productRow).toContainText("16 dec. 2026");
  // Correcting the date of a record moves its next due date with it, product interval included.
  await productRow.getByRole("button", { name: /^Modifică Deparazitare internă/ }).click();
  const editForm = page.locator("dialog[open] form");
  await expect(editForm.locator('select[name="kind"]')).toHaveValue("deworm_internal");
  await expect(editForm.locator('select[name="clinicId"] option:checked')).toHaveText("Echovet");
  await editForm.locator('input[name="date"]').fill("2026-11-10");
  await editForm.locator('textarea[name="description"]').fill(`QA corectat ${run}`);
  await editForm.locator('button:has-text("Salvează")').click();
  await expect(page.getByRole("status")).toBeVisible();
  const editedRow = page.locator("#medical li", { hasText: `QA corectat ${run}` });
  await expect(editedRow).toContainText("10 nov. 2026");
  await expect(editedRow).toContainText("25 dec. 2026");
  await expect(editedRow).toContainText(productName);
  // A next date typed by hand is kept.
  await editedRow.getByRole("button", { name: /^Modifică/ }).click();
  await page.locator('dialog[open] input[name="nextDueOn"]').fill("2027-02-03");
  await page.locator('dialog[open] button:has-text("Salvează")').click();
  await expect(page.locator("#medical li", { hasText: `QA corectat ${run}` })).toContainText("3 feb. 2027");
  // A test type has no product field.
  await page.click('button:has-text("Adaugă înregistrare medicală")');
  await page.locator('dialog[open] select[name="kind"]').selectOption("test_fiv_felv");
  await expect(page.locator('dialog[open] select[name="productId"]')).toHaveCount(0);
  await expect(page.locator('dialog[open] select[name="result"]')).toBeVisible();
  await page.locator("dialog[open]").press("Escape");

  // One tap records today's treatment, and undo removes it again.
  const before = await page.locator("#medical ul li").count();
  await page.getByRole("button", { name: /Deparazitare externă/ }).click();
  await expect(page.locator("#medical ul li")).toHaveCount(before + 1);
  await page.getByRole("status").getByRole("button", { name: "Anulează" }).click();
  await expect(page.locator("#medical ul li")).toHaveCount(before);

  // An uploaded photo loses its embedded location.
  const withGps = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } })
    .withExif({ IFD0: { Make: "QA-CAMERA-MARKER" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "44/1 26/1 0/1" } })
    .jpeg().toBuffer();
  expect(withGps.includes("QA-CAMERA-MARKER")).toBe(true);
  await page.goto(`${page.url().split("?")[0]}?tab=photos`);
  await page.setInputFiles('input[name="photo"]', { name: "gps.jpg", mimeType: "image/jpeg", buffer: withGps });
  await page.click('button:has-text("Încarcă")');
  await expect(page.getByRole("status")).toBeVisible();
  const photoSrc = (await page.locator('main a[href^="/photos/"]').first().getAttribute("href"))!;
  const stored = Buffer.from(await (await page.request.get(photoSrc)).body());
  expect(stored.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(stored.includes("QA-CAMERA-MARKER")).toBe(false);
  expect(stored.includes("Exif")).toBe(false);

  // A photo near the 10 MB limit arrives whole through the proxy and is stored at most 2048 px wide.
  const side = 2600;
  const noise = Buffer.alloc(side * side * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const large = await sharp(noise, { raw: { width: side, height: side, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  expect(large.length).toBeGreaterThan(6 * 1024 * 1024);
  expect(large.length).toBeLessThan(10 * 1024 * 1024);
  const photosBefore = await page.locator('main a[href^="/photos/"]').count();
  await page.setInputFiles('input[name="photo"]', { name: "large.jpg", mimeType: "image/jpeg", buffer: large });
  await page.click('button:has-text("Încarcă")');
  await expect(page.locator('main a[href^="/photos/"]')).toHaveCount(photosBefore + 1);
  const hrefs = await page.locator('main a[href^="/photos/"]').evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
  const widths = await Promise.all(hrefs.map(async (h) => (await sharp(Buffer.from(await (await page.request.get(h)).body())).metadata()).width));
  expect(widths).toContain(2048);

  // Global search finds the new cat from anywhere.
  await page.goto("/calendar");
  await page.getByLabel("Caută pisici, persoane…").first().fill(`QA Pisica ${run}`);
  await page.getByRole("button", { name: new RegExp(`QA Pisica ${run}`) }).click();
  await expect(page.locator("h1")).toHaveText(name);

  // Cards filter instantly as you type.
  await page.goto("/animals");
  await page.getByLabel("Caută după nume sau microcip…").fill(`QA Pisica ${run}`);
  await expect(page.locator("main li a")).toHaveCount(1);

  // Language switch, then back to Romanian.
  await page.goto("/account");
  await page.locator('select[name="locale"]').selectOption("en");
  await page.locator('form:has(select[name="locale"]) button').click();
  await expect(page.locator("h1")).toHaveText("My account");
  await page.locator('select[name="locale"]').selectOption("ro");
  await page.locator('form:has(select[name="locale"]) button').click();
  await expect(page.locator("h1")).toHaveText("Contul meu");

  await page.goto("/calendar/new");
  await page.fill('input[name="title"]', `QA Tura ${run}`);
  await page.fill('input[name="startOn"]', "2026-12-14");
  await page.fill('input[name="capacity"]', "1");
  await page.fill('input[name="repeat"]', "1");
  await page.click('button:has-text("Salvează")');
  await expect(page).toHaveURL(/m=2026-12/);
  await expect(page.locator("main")).toContainText(`QA Tura ${run}`);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/animals");
  const catHref = (await page.locator("main li a").first().getAttribute("href"))!;
  const shots: [string, string][] = [
    ["/", "dashboard"], ["/animals", "animals"], ["/calendar?m=2026-07", "calendar"], ["/adoptions", "adoptions"],
    [catHref, "cat"], [`${catHref}?tab=medical`, "cat-medical"], ["/people", "people"], ["/reports", "reports"], ["/reports/period", "reports-period"], ["/reports/medical", "reports-medical"],
    ["/review", "review"], ["/visibility", "visibility"], ["/account", "account"], ["/admin/users", "users"], ["/admin/audit", "audit"], ["/admin/privacy", "privacy"], ["/admin/lists", "lists"],
  ];
  for (const [path, file] of shots) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/${file}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 800 });
  for (const [path, file] of shots) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/${file}-mobile.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows on a phone`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  expect(failures).toEqual([]);
});

test("period report: filters live in the link, and downloads match", async ({ page }) => {
  const failures = watchFailures(page);
  await signIn(page, adminEmail, adminPassword);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/reports/period");
  await expect(page.locator('a[aria-current="page"]', { hasText: "Pe perioadă" })).toBeVisible();

  await page.click('a:has-text("Anul trecut")');
  await expect(page).toHaveURL(/preset=last_year/);
  await page.fill('input[name="from"]', "2025-01-01");
  await page.fill('input[name="to"]', "2025-03-31");
  await page.selectOption('select[name="species"]', "cat");
  await page.click('button:has-text("Aplică")');
  await expect(page).toHaveURL(/from=2025-01-01&to=2025-03-31&species=cat/);
  await expect(page.locator('input[name="from"]')).toHaveValue("2025-01-01");
  await page.click('summary:has-text("Vezi tabelul")');
  await expect(page.locator("main tbody tr").filter({ hasText: /2025/ })).toHaveCount(3);

  const query = "from=2025-01-01&to=2025-03-31&species=cat";
  const xlsx = await page.request.get(`/export/report/period?${query}&format=xlsx`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect(xlsx.headers()["content-disposition"]).toContain("greencats-period-2025-01-01_2025-03-31.xlsx");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

  const csv = await page.request.get(`/export/report/period?${query}&format=csv&table=monthly`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const lines = (await csv.text()).trim().split("\r\n");
  expect(lines[0]).toContain("Luna");
  expect(lines.slice(1).map((l) => l.split(",")[0])).toEqual(["2025-01", "2025-02", "2025-03"]);

  expect((await page.request.get(`/export/report/period?${query}&format=csv&table=nope`)).status()).toBe(404);
  expect((await page.request.get("/export/report/nope")).status()).toBe(404);
  expect((await page.request.get("/export/report/constructor")).status()).toBe(404);

  await page.goto("/admin/audit");
  await expect(page.locator("main")).toContainText("export.report.period");
  expect(failures).toEqual([]);
});

test("medical report: clinic filter and downloads", async ({ page }) => {
  const failures = watchFailures(page);
  await signIn(page, adminEmail, adminPassword);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/reports/medical?preset=last_12_months");
  await expect(page.locator('a[aria-current="page"]', { hasText: "Medical" })).toBeVisible();
  // The clinic list is filled by normalize-medical, so there is at least one to choose.
  const clinic = await page.locator('select[name="clinic"] option').nth(1).getAttribute("value");
  expect(clinic).toBeTruthy();
  await page.selectOption('select[name="clinic"]', clinic!);
  await page.click('button:has-text("Aplică")');
  await expect(page).toHaveURL(new RegExp(`clinic=${clinic}`));
  await expect(page.locator("main")).toContainText("Test FIV/FeLV");

  const csv = await page.request.get(`/export/report/medical?preset=last_12_months&clinic=${clinic}&format=csv&table=tests`);
  expect(csv.status()).toBe(200);
  const lines = (await csv.text()).trim().split("\r\n");
  expect(lines).toHaveLength(5);
  expect(lines[1]).toContain("Test FIV/FeLV");
  const xlsx = await page.request.get("/export/report/medical?format=xlsx");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect(failures).toEqual([]);
});

test("a volunteer can't reach contact details or admin pages; a coordinator can see contacts", async ({ page, browser }) => {
  // A coordinator adds a person with a phone, so the test doesn't depend on imported data.
  await firstLogin(page, coordinator.email, coordinator.password, coordinator.next);
  await page.goto("/people/new");
  const contactName = `QA Persoana Telefon ${run}`;
  await page.fill('input[name="name"]', contactName);
  await page.fill('input[name="phones"]', "0740 000 199");
  await page.click('button:has-text("Salvează")');
  await expect(page.locator("h1")).toHaveText(contactName);
  const href = new URL(page.url()).pathname;
  const phone = "+40740000199";
  await page.goto(`/people?q=${encodeURIComponent(contactName)}`);
  await expect(page.locator("tbody tr", { hasText: contactName })).toContainText(phone);
  await page.goto(href);
  await expect(page.locator("main")).toContainText(phone);
  expect((await page.request.get("/export/adoptions")).status()).toBe(200);
  const personId = href.split("/").pop()!;
  const exported = await page.request.get(`/export/person/${personId}`);
  expect(exported.status()).toBe(200);
  expect(JSON.stringify(await exported.json())).toContain(phone);
  // Erasing is for admins only.
  await page.goto("/admin/privacy");
  await expect(page.locator("h1")).not.toHaveText("Protecția datelor");

  const context = await browser.newContext();
  const vol = await context.newPage();
  const failures = watchFailures(vol);
  await firstLogin(vol, volunteer.email, volunteer.password, volunteer.next);

  for (const path of [href, "/people"]) {
    await vol.goto(path);
    expect(await vol.content()).not.toContain(phone);
  }
  expect((await vol.request.get(`/export/person/${personId}`)).status()).toBe(403);
  // No phone number reaches a volunteer on the pages built from free text, and no foster rating on the people list.
  for (const path of ["/visibility", "/adoptions", "/calendar", "/"]) {
    await vol.goto(path);
    const body = await vol.locator("main").innerText();
    expect(body, `${path} shows a phone number to a volunteer`).not.toMatch(/(?<![\d.])(?:\+?40|0)[ .-]?7(?:[ .-]?\d){8}(?![\d.])/);
  }
  await vol.goto("/people");
  await expect(vol.locator("thead")).not.toContainText("Evaluare foster");
  await vol.goto("/admin/privacy");
  await expect(vol.locator("h1")).not.toHaveText("Protecția datelor");
  await vol.goto("/admin/lists");
  await expect(vol.locator("h1")).not.toHaveText("Liste");
  await vol.goto("/admin/users");
  await expect(vol.locator('.toast-in[role="alert"]')).toBeVisible();
  await expect(vol.locator("h1")).not.toHaveText("Utilizatori");
  await vol.goto("/review");
  await expect(vol.locator('.toast-in[role="alert"]')).toBeVisible();
  await expect(vol.locator("h1")).not.toHaveText("De verificat după import");
  await vol.goto("/adoptions");
  await expect(vol.locator("form select[name='stage']")).toHaveCount(0);
  expect((await vol.request.get("/export/adoptions")).status()).toBe(403);
  expect((await vol.request.get("/export/animals")).status()).toBe(200);
  // The period report holds no personal data, so everyone may download it.
  expect((await vol.request.get("/export/report/period?format=csv&table=animals")).status()).toBe(200);

  // The volunteer takes the only place on a shift; the coordinator then can't.
  // The day's panel lists everything, even when the month cell shows only the first few.
  await vol.goto("/calendar?m=2026-12&d=2026-12-14");
  await vol.locator(`a:has-text("QA Tura ${run}")`).first().click();
  await vol.click('button:has-text("Mă înscriu")');
  await expect(vol.locator("main")).toContainText("QA Voluntar");
  const shiftUrl = vol.url();
  await page.goto(shiftUrl);
  await expect(page.locator('button:has-text("Mă înscriu")')).toHaveCount(0);
  await vol.click('button:has-text("Mă retrag")');
  await expect(vol.locator('button:has-text("Mă înscriu")')).toBeVisible();

  expect(failures).toEqual([]);
  await context.close();
});

test("data protection: erase a person, delete a cat and an account, and limits on volunteers", async ({ page, browser }) => {
  const failures = watchFailures(page);
  await signIn(page, adminEmail, adminPassword);
  await expect(page).toHaveURL(/\/$/);
  const confirm = async (label: string) => {
    await page.locator(`button[aria-label="${label}"]:visible`).first().click();
    // The first tap only arms the button. Nothing is submitted yet.
    await page.waitForTimeout(500);
    await expect(page.locator('button:has-text("Sigur?"):visible')).toBeVisible();
    await page.locator('button:has-text("Sigur?"):visible').click();
  };

  // A changed "back" address can't send the browser to another site.
  await page.goto("/account");
  await page.locator('input[name="back"]').evaluate((el) => { (el as HTMLInputElement).value = "//example.org/x"; });
  await page.locator('form:has(select[name="locale"]) button').click();
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).pathname).toBe("/account");

  // Erasing a person empties the record and takes it off the list.
  await page.goto("/people/new");
  const personName = `QA Persoana ${run}`;
  await page.fill('input[name="name"]', personName);
  await page.fill('input[name="phones"]', "0700 000 001");
  await page.fill('input[name="consentNote"]', "contract de test");
  await page.click('button:has-text("Salvează")');
  await expect(page.locator("h1")).toHaveText(personName);
  await expect(page.locator("main")).toContainText("contract de test");
  const personId = new URL(page.url()).pathname.split("/").pop()!;

  // An adoption case typed with this person's name is linked to them. Changing the adopter
  // moves the link, so the old person's data export and erasure no longer reach the case.
  await page.goto("/adoptions");
  await page.click('summary:has-text("Caz nou")');
  const newCase = page.locator("details[open] form").first();
  await newCase.locator('input[name="animalName"]').fill(`QA Adoptie ${run}`);
  await newCase.locator('input[name="adopterName"]').fill(personName);
  await newCase.locator('button:has-text("Salvează")').click();
  await expect(page.locator("main")).toContainText(`QA Adoptie ${run}`);
  expect(JSON.stringify(await (await page.request.get(`/export/person/${personId}`)).json())).toContain(`QA Adoptie ${run}`);
  const caseRow = page.locator("li", { hasText: `QA Adoptie ${run}` });
  await caseRow.locator('summary:has-text("Modifică")').click();
  await caseRow.locator('input[name="adopterName"]').fill(`QA Alt Adoptator ${run}`);
  await caseRow.locator('button:has-text("Salvează")').click();
  await expect(page.locator("main")).toContainText(`QA Alt Adoptator ${run}`);
  expect(JSON.stringify(await (await page.request.get(`/export/person/${personId}`)).json())).not.toContain(`QA Adoptie ${run}`);

  // Erasing also clears what the person's adoption case and a visibility case naming them say.
  // Other text that mentions them is listed on their page first, to be cleaned by hand.
  await page.click('summary:has-text("Caz nou")');
  const ownCase = page.locator("details[open] form").first();
  await ownCase.locator('input[name="animalName"]').fill(`QA Adoptie2 ${run}`);
  await ownCase.locator('input[name="adopterName"]').fill(personName);
  await ownCase.locator('input[name="contractNo"]').fill(`C-${run}`);
  await ownCase.locator('input[name="notes"]').fill(`nota adoptie ${run}`);
  await ownCase.locator('button:has-text("Salvează")').click();
  await expect(page.locator("main")).toContainText(`nota adoptie ${run}`);
  await page.goto("/visibility");
  await page.click('summary:has-text("Caz nou")');
  const visCase = page.locator("details[open] form").first();
  await visCase.locator('input[name="animalName"]').fill(`QA Vizibilitate ${run}`);
  await visCase.locator('input[name="contactName"]').fill(personName);
  await visCase.locator('button:has-text("Salvează")').click();
  await expect(page.locator("main")).toContainText(`QA Vizibilitate ${run}`);
  const [namedCat] = await (await page.request.get(`/api/search?q=${encodeURIComponent(`QA Pisica ${run}`)}`)).json();
  await page.goto(namedCat.href);
  await page.click('button:has-text("Modifică detaliile")');
  await page.locator('form:has(input[name="color"]) textarea[name="intakeHistory"]').fill(`adusa de ${personName}`);
  await page.locator('form:has(input[name="color"]) button:has-text("Salvează")').click();
  await expect(page.locator('.toast-in[role="status"]')).toBeVisible();
  await page.goto(`/people/${personId}`);
  await expect(page.locator("main")).toContainText("Numele apare și în alte texte");
  await expect(page.locator("main")).toContainText(`QA Pisica ${run}`);
  await expect(page.locator("main")).not.toContainText(`QA Vizibilitate ${run}`);

  await confirm("Șterge datele persoanei");
  await expect(page.locator("h1")).toHaveText("Persoană ștearsă");
  await expect(page.locator("main")).not.toContainText("700");
  expect(await (await page.request.get(`/api/search?q=${encodeURIComponent(personName)}`)).json()).toEqual([]);
  await page.goto("/adoptions");
  const erasedCase = page.locator("li", { hasText: `QA Adoptie2 ${run}` });
  await expect(erasedCase).toBeVisible();
  await expect(erasedCase).not.toContainText(personName);
  await expect(erasedCase).not.toContainText(`nota adoptie ${run}`);
  await erasedCase.locator('summary:has-text("Modifică")').click();
  await expect(erasedCase.locator('input[name="contractNo"]')).toHaveValue("");
  await page.goto("/visibility");
  await expect(page.locator("main")).toContainText(`QA Vizibilitate ${run}`);
  await expect(page.locator("main")).not.toContainText(personName);

  // A volunteer can't delete a medical record someone else entered. The admin can.
  const [cat] = await (await page.request.get(`/api/search?q=${encodeURIComponent(`QA Pisica ${run}`)}`)).json();
  const context = await browser.newContext();
  const vol = await context.newPage();
  await signIn(vol, volunteer.email, volunteer.next);
  await expect(vol).toHaveURL(/\/$/);
  // A field holding a phone the volunteer can't see is read-only for them, and saving
  // the form keeps the real text instead of the "hidden" marker.
  await page.goto(cat.href);
  await page.click('button:has-text("Modifică detaliile")');
  const adminForm = page.locator('form:has(input[name="color"])');
  await adminForm.locator('input[name="color"]').fill("tabby, 0740000150");
  await adminForm.locator('input[name="microchip"]').fill("642090000000150");
  await adminForm.locator('button:has-text("Salvează")').click();
  await expect(page.locator('.toast-in[role="status"]')).toBeVisible();
  await vol.goto(cat.href);
  await vol.click('button:has-text("Modifică detaliile")');
  const volForm = vol.locator('form:has(input[name="color"])');
  await expect(volForm.locator('input[name="color"]')).toBeDisabled();
  await expect(volForm.locator('input[name="color"]')).not.toHaveValue(/0740000150/);
  // The microchip is hidden from volunteers everywhere: the page, the form, search and the export.
  await expect(volForm.locator('input[name="microchip"]')).toBeDisabled();
  await expect(volForm.locator('input[name="microchip"]')).toHaveValue("[ascuns]");
  await expect(vol.locator("main")).not.toContainText("642090000000150");
  expect(await (await vol.request.get("/api/search?q=642090000000150")).json()).toEqual([]);
  const volExport = await (await vol.request.get("/export/animals")).text();
  expect(volExport).toContain(`QA Pisica ${run}`);
  expect(volExport).not.toContain("642090000000150");
  expect(volExport).not.toContain("0740000150");
  await volForm.locator('textarea[name="otherInfo"]').fill(`QA nota voluntar ${run}`);
  await volForm.locator('button:has-text("Salvează")').click();
  await expect(vol.locator('.toast-in[role="status"]')).toBeVisible();
  await page.goto(cat.href);
  await page.click('button:has-text("Modifică detaliile")');
  await expect(adminForm.locator('input[name="color"]')).toHaveValue("tabby, 0740000150");
  await expect(adminForm.locator('input[name="microchip"]')).toHaveValue("642090000000150");
  expect((await (await page.request.get("/api/search?q=642090000000150")).json()).map((r: { title: string }) => r.title)).toContain(`QA Pisica ${run}`);
  await expect(adminForm.locator('textarea[name="otherInfo"]')).toHaveValue(`QA nota voluntar ${run}`);

  await vol.goto(`${cat.href}?tab=medical`);
  await expect(vol.locator("#medical")).toContainText("2027");
  await expect(vol.locator('#medical button[aria-label="Șterge"]')).toHaveCount(0);
  await expect(vol.locator('#medical button[aria-label^="Modifică"]')).toHaveCount(0);
  // A volunteer corrects their own record. A phone they wrote in it is hidden from them, so the
  // description is locked and keeps the number when the date changes.
  await vol.click('button:has-text("Adaugă înregistrare medicală")');
  await vol.locator('dialog[open] select[name="kind"]').selectOption("note");
  await vol.locator('dialog[open] input[name="date"]').fill("2026-11-02");
  await vol.locator('dialog[open] input[name="description"]').fill(`QA sunat ${run} la 0740000151`);
  await vol.locator('dialog[open] button:has-text("Salvează")').click();
  const volRow = vol.locator("#medical li", { hasText: `QA sunat ${run}` });
  await expect(volRow).not.toContainText("0740000151");
  await volRow.getByRole("button", { name: /^Modifică/ }).click();
  await expect(vol.locator("dialog[open] textarea").first()).toBeDisabled();
  await vol.locator('dialog[open] input[name="date"]').fill("2026-11-03");
  await vol.locator('dialog[open] button:has-text("Salvează")').click();
  await expect(vol.locator("#medical li", { hasText: `QA sunat ${run}` })).toContainText("3 nov. 2026");
  await context.close();
  await page.goto(`${cat.href}?tab=medical`);
  await expect(page.locator('#medical button[aria-label="Șterge"]')).not.toHaveCount(0);
  await expect(page.locator("#medical li", { hasText: `QA sunat ${run}` })).toContainText("0740000151");

  // Deleting the cat removes it and its photo.
  const photo = (await page.request.get(`${cat.href}?tab=photos`).then((r) => r.text())).match(/\/photos\/[0-9a-f-]{36}/)![0];
  expect((await page.request.get(photo)).status()).toBe(200);
  await page.click('button:has-text("Modifică detaliile")');
  await confirm("Șterge animalul");
  await expect(page).toHaveURL(/\/animals(\?|$)/);
  expect((await page.request.get(photo)).status()).toBe(404);
  expect(await (await page.request.get(`/api/search?q=${encodeURIComponent(`QA Pisica ${run}`)}`)).json()).toEqual([]);

  // Deleting accounts.
  for (const email of [volunteer.email, coordinator.email]) {
    await page.goto("/admin/users");
    const row = page.locator("li", { hasText: email });
    await row.locator('button[aria-label="Șterge contul"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("li", { hasText: email })).toHaveCount(1);
    await row.locator('button:has-text("Sigur?")').click();
    await expect(page.locator("li", { hasText: email })).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
