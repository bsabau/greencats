import type { MedicalKind } from "./medical-schedule";

/**
 * The products and clinics found in the team's notes on 10 November 2026, with the
 * spellings used for each. Loaded once into an empty database, then edited on the
 * Lists page. Which record types a product belongs to is general product knowledge
 * and the shelter's vet should check it; intervals are left empty on purpose.
 */
const E: MedicalKind = "deworm_external";
const I: MedicalKind = "deworm_internal";
const P: MedicalKind = "vaccine_polyvalent";
const R: MedicalKind = "vaccine_rabies";

export const SEED_PRODUCTS: { name: string; kinds: MedicalKind[]; aliases: string[] }[] = [
  // Vaccines
  { name: "Nobivac Tricat Trio", kinds: [P], aliases: ["tricat", "tricat trio", "tricattrio", "poli tricat", "nobivac tricat"] },
  { name: "Nobivac Rabies", kinds: [R], aliases: ["nobivac"] },
  { name: "Nobivac DHPPi", kinds: [P], aliases: ["dhppi"] },
  { name: "Biocan", kinds: [P], aliases: [] },
  // External parasites
  { name: "Fiprex", kinds: [E], aliases: ["fibrex", "firpex"] },
  { name: "Fipronil", kinds: [E], aliases: ["vanelli", "vanelli fipronil", "fipnil combo", "fipronil combo"] },
  { name: "Fypryst", kinds: [E], aliases: ["frypyst", "fypryst combo"] },
  { name: "Frontline", kinds: [E], aliases: ["frontline spray", "frontline combo"] },
  { name: "Zeronil", kinds: [E], aliases: [] },
  { name: "NexGard", kinds: [E], aliases: ["nextgard"] },
  { name: "Bravecto", kinds: [E], aliases: ["braveco", "bravecto felis"] },
  { name: "Credelio", kinds: [E], aliases: [] },
  { name: "Vectra 3D", kinds: [E], aliases: ["vectra"] },
  // Against both external and internal parasites
  { name: "Chanhold", kinds: [E, I], aliases: ["changhold", "chanchold", "chnahold"] },
  { name: "Stronghold", kinds: [E, I], aliases: ["stroghold", "stornghold"] },
  { name: "Stronghold Plus", kinds: [E, I], aliases: [] },
  { name: "Selehold", kinds: [E, I], aliases: [] },
  { name: "Evicto", kinds: [E, I], aliases: [] },
  { name: "NexGard Combo", kinds: [E, I], aliases: ["nextgard combo", "nexgardcombo", "nexagrd combo"] },
  { name: "NexGard Plus", kinds: [E, I], aliases: ["nextgard plus"] },
  { name: "NexGard Spectra", kinds: [E, I], aliases: ["nextgard spectra"] },
  { name: "Bravecto Plus", kinds: [E, I], aliases: ["bravecto plus felis"] },
  { name: "Broadline", kinds: [E, I], aliases: [] },
  { name: "Advocate", kinds: [E, I], aliases: [] },
  { name: "Moxiclear", kinds: [E, I], aliases: [] },
  { name: "Felpreva", kinds: [E, I], aliases: [] },
  // Internal parasites
  { name: "Drontal", kinds: [I], aliases: ["drontal cat"] },
  { name: "Drontal Puppy", kinds: [I], aliases: ["drontal sirop"] },
  { name: "Exitel", kinds: [I], aliases: ["exitel cat"] },
  { name: "Cestal", kinds: [I], aliases: ["cestal cat"] },
  { name: "Cestal Dog", kinds: [I], aliases: [] },
  { name: "Dehinel", kinds: [I], aliases: [] },
  { name: "Biheldon", kinds: [I], aliases: [] },
  { name: "Milbemax", kinds: [I], aliases: ["milbermax", "milbemax cat"] },
  { name: "Milpro", kinds: [I], aliases: [] },
  { name: "Milprazon", kinds: [I], aliases: ["milprazon kitten"] },
  { name: "Caniverm", kinds: [I], aliases: ["canivern"] },
  { name: "Procox", kinds: [I], aliases: [] },
  { name: "Vermis Ex", kinds: [I], aliases: [] },
  { name: "Dronspot", kinds: [I], aliases: [] },
];

export const SEED_CLINICS: { name: string; aliases: string[] }[] = [
  { name: "Energy Vet", aliases: ["energy", "energyvet"] },
  { name: "Echovet", aliases: ["echo vet"] },
  { name: "Animalia", aliases: [] },
  { name: "Feline Focus", aliases: [] },
];
