# Plan: tabele de referință pentru produse, clinici și locații

## Stare

- **Etapa 1 (produse și clinici): făcută pe 10 noiembrie 2026.** Diferențe față de plan: un produs poate avea mai multe tipuri (de exemplu NexGard Combo, pentru deparazitare externă și internă), iar intervalele scurte pentru pui au prioritate și la deparazitarea internă, nu doar la vaccinul polivalent.
- **Etapa 2 (locații): făcută pe 10 noiembrie 2026**, pe ramura `etapa-2-locatii`. Diferențe față de plan:
  - Tipul `animal_status` e recreat în migrare, nu extins cu `ADD VALUE`, deci `casuta` și `ana_adi` nu mai există deloc. O valoare adăugată cu `ADD VALUE` nu poate fi folosită în aceeași tranzacție, iar migratorul aplică toate migrările într-o singură tranzacție. drizzle-kit generează oricum recrearea când scoți valori din enum, iar mutarea datelor se face cât timp coloana e text.
  - O constrângere în baza de date: `location_id` e completat doar când statutul e `in_shelter`. La orice alt statut, locația se golește.
  - Locațiile pot fi și unite, ca produsele și clinicile: animalele trec pe locația aleasă. Ștergerea nu există.
  - Eticheta de statut arată locul („La Căsuță”). Pagina Animale are câte o filă pe locație, Rapoartele numără pe locație, iar exportul CSV are o coloană `location`.
  - Importul păstrează locațiile la `--replace` și le găsește după nume. Dacă „Căsuță” sau „Ana & Adi” sunt redenumite, un re-import le creează din nou cu numele vechi.
  - Verificat pe registrul real: migrarea păstrează cele 389 de pisici, 21 ajung la Căsuță și 7 la Ana & Adi, iar un import de la zero dă exact același statut și aceeași locație pentru fiecare.
- Etapa 3: neîncepută.

## Context

Analiza datelor din 10 noiembrie 2026 a arătat că trei lucruri sunt scrise de mână, cu variante, deși sunt de fapt liste:

- **Produse** în descrierea înregistrărilor medicale: 57 de variante la deparazitarea externă, 43 la cea internă („nexgard" / „nextgard", „chanhold" / „changhold", „drontal" / „drontal cat"). Toate primesc același interval de scadență, deși produsele acoperă perioade diferite.
- **Clinici** („Energy", „Echovet", „Animalia") amestecate în descrierea vaccinului și în textul de sterilizare.
- **Locații** („Căsuță", „Ana & Adi") fixate în lista de statut, deci un loc nou cere modificare de cod.

Scopul: liste editabile de un admin, date existente unificate, scadențe calculate pe produs. „Vaccinat/nevaccinat" rămâne calculat din înregistrările medicale și nu devine tabel. Listele de care depinde codul (statut, sex, sterilizat, tip medical, etapă adopție, evaluare foster) rămân enum-uri.


## Etapa 1 — Produse și clinici

### Schemă (`src/db/schema.ts`, migrare nouă cu `npm run db:generate`)

- `products`: `id`, `name` (unic, fără diferență de majuscule), `kind` (`medicalKindEnum`), `intervalDays` (opțional; gol = regula generală), `active`, `createdAt`.
- `product_aliases`: `alias` (unic, normalizat), `productId`. Ține variantele vechi, folosite la unificare și la import.
- `clinics`: `id`, `name` (unic), `active`, `createdAt`.
- `medical_records`: coloane noi `productId` și `clinicId` (opționale, `on delete set null`). `description` rămâne pentru detalii libere (doză, observații).

### Unificarea datelor existente (`scripts/normalize-medical.ts`, comandă `npm run normalize-medical`)

1. Rulare „dry-run" implicită: grupează descrierile cu `fold()` din `src/lib/text.ts`, propune produs/clinică pentru fiecare variantă și scrie un raport cu numărul de rânduri atinse. Nu modifică nimic.
2. O hartă de pornire în script pentru variantele deja văzute (ex. `nextgard → NexGard`, `changhold → Chanhold`, `vanelli (fipronil) → Fipronil`, `energy → clinică Energy`).
3. Cu `--apply`: creează produsele, aliasurile și clinicile, completează `productId` / `clinicId`, și scoate numele produsului din `description` doar când descrierea era exact numele. `rawText` nu se atinge, deci textul original rămâne.
4. Variantele nerecunoscute rămân text și intră în `import_issues`, ca să apară pe „De verificat".
5. Un backup criptat se face înainte de `--apply` (`docker compose run --rm backup once`).

### Scadențe pe produs (`src/lib/medical-schedule.ts`)

- `nextDue(kind, date, birthDate, intervalDays?)`: dacă produsul are interval, se folosește acela; altfel regula actuală din `SCHEDULE`. Regula pentru pui la vaccinul polivalent rămâne neschimbată.
- Apelanți de actualizat în `src/app/actions.ts`: `addMedicalRecord`, `completeDue`.
- `completeDue` („Făcut" cu un clic) folosește produsul ultimei înregistrări de același tip a pisicii.
- Scadențele deja salvate nu se recalculează automat. Scriptul de unificare raportează câte s-ar schimba, iar recalcularea e un pas separat, cu `--recalculate`, după confirmarea veterinarului.

### Interfață

- Formularul „Adaugă înregistrare medicală" din `src/app/(app)/animals/[id]/page.tsx`: câmp Produs (lista filtrată după tipul ales) și câmp Clinică, cu `Combobox` din `src/components/client.tsx`. Descrierea rămâne opțională.
- Istoricul medical afișează produsul și clinica înaintea descrierii.
- Pagină nouă `src/app/(app)/admin/lists/page.tsx` („Liste"), cu permisiune nouă `lists:manage` pentru admin și coordonator în `src/lib/permissions.ts`: adaugă, redenumește, dezactivează, setează intervalul, unește două produse (mută înregistrările și păstrează numele vechi ca alias). Ștergerea nu există; un produs folosit se dezactivează.
- Intrare în meniu în `src/app/(app)/layout.tsx`, chei noi în `src/i18n/ro.ts` și `src/i18n/en.ts`.
- Acțiunile noi scriu în jurnal cu `audit()` din `src/lib/auth.ts`.

### Import (`scripts/import-xlsx.ts`)

La un re-import, descrierile se potrivesc cu `product_aliases` și clinicile cu `clinics`, ca datele să nu revină la text liber. Tabelele de liste nu se golesc la `--replace`.

## Etapa 2 — Locații

- Tabel `locations`: `id`, `name`, `active`. Porneşte cu „Căsuță" și „Ana & Adi".
- `animals.locationId` (opțional). Statutul capătă o valoare nouă `in_shelter`; migrarea mută `casuta` și `ana_adi` pe `in_shelter` + locația potrivită. `clinic`, `foster` și restul rămân cum sunt.
- Postgres nu poate șterge valori dintr-un enum, deci `casuta` și `ana_adi` rămân în tip, nefolosite, și se scot din liste în cod.
- Locuri de actualizat: `CARE_STATUSES` în `src/domain/due.ts`, `src/app/(app)/animals/page.tsx` (file și culori), `src/app/(app)/animals/new/page.tsx`, `src/components/ui.tsx` (`StatusBadge`), `src/app/api/search/route.ts`, `src/domain/reports.ts`, `moveAnimal` în `src/app/actions.ts`, `MoveFields` în `src/components/client.tsx` (alegerea locației când statutul e „în adăpost"), `scripts/import-xlsx.ts`.
- Gestionarea locațiilor intră pe aceeași pagină „Liste".

Etapa 2 atinge mai mult cod decât etapa 1 și se face separat, după ce etapa 1 e folosită câteva zile.

## Etapa 3 — Curățenie de date (mică, opțională)

- **Culoare:** sugestii la tastare (`datalist`) din valorile existente, fără tabel. Valoarea greșită „12.08.2024 recontrol 10-14 zile" merge pe „De verificat".
- **Text sterilizare:** unde textul conține dată și clinică și nu există deja o înregistrare de sterilizare, scriptul de unificare creează una.
- **Acte la adopții și da/nu la vizibilitate:** rămân text deocamdată (17 și 55 de rânduri).

## În afara planului

- Sexul necunoscut la 274 din 389 de pisici: e de completat de echipă, nu de structură.
- Câmpul „Contract" (163 de variante): aștept explicația echipei despre ce înseamnă „Lux 2022", „Elveția 2022", „ajutor financiar".

## Întrebări deschise

1. Intervalele pe produs (ex. Bravecto față de Fiprex) vin de la veterinar. Până atunci câmpul rămâne gol și se aplică regula actuală.
2. „Energy" și „Echovet" apar la vaccinuri: presupun că sunt clinici, nu mărci de vaccin. De confirmat.
3. Cine editează listele: admin și coordonator (propunerea din plan) sau doar admin?

## Verificare

- `npx tsc --noEmit` și `npm test`, cu teste noi în `tests/` pentru `nextDue` cu interval pe produs și pentru potrivirea aliasurilor.
- Rulare „dry-run" a scriptului pe baza locală și citirea raportului înainte de `--apply`. După `--apply`: numărul total de înregistrări medicale rămâne 1.664, iar interogarea de distribuție arată o singură valoare pentru fiecare produs.
- Reconstruire cu `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait`, apoi `npx playwright test` cu pași noi în `tests/e2e/smoke.spec.ts`: admin adaugă un produs cu interval, îl folosește la o înregistrare și vede scadența calculată din interval; voluntarul nu ajunge pe pagina „Liste".
- Verificare cu ochii, pe desktop și telefon, a formularului medical și a paginii „Liste".
