/**
 * What the store may sell: only medicines anyone can buy over the counter, with no prescription
 * and no restriction. This is an allowlist on purpose. A product is sellable only when every active
 * ingredient is on it, so an unknown or combination product is refused rather than guessed at.
 *
 * Used by the catalogue importer, the purge script and the API (admins cannot add anything else).
 * Review against the DGDA OTC list before widening it.
 */

/** Ingredients that are fine over the counter in any oral or topical form. */
const ANY_FORM = [
  // Fever & pain
  /paracetamol|acetaminophen/, /\bibuprofen\b/, /\bcaffeine\b/,
  // Acidity, gas, digestion
  /alumin(i)?um hydroxide/, /magnesium (hydroxide|trisilicate|carbonate)/, /magaldrate/, /sim(e|i)thicone|dimethicone|dimeticone/,
  /sodium alginate|alginic acid/, /calcium carbonate/, /sodium bicarbonate/, /potassium bicarbonate/,
  // Diarrhoea, constipation
  /oral rehydration|rehydration salt|\bors\b|orsaline/, /lactobacill|bifidobacter|saccharomyces|bacillus clausii|probiotic|prebiotic|inulin|fructo-?oligosaccharide/,
  /ispaghula|psyllium/, /lactulose/, /senna|sennoside/, /glycerin|glycerol/,
  // Allergy, cold, throat
  /cetirizine|levocetirizine/, /\b(des)?loratadine\b/, /fexofenadine/, /chlorphen(ir)?amine/,
  /\bambroxol\b/, /bromhexine/, /guai(f|ph)enesin/, /amylmetacresol|dichlorobenzyl alcohol/, /\bmenthol\b|eucalypt|camphor|peppermint|thymol/,
  // Vitamins, minerals, supplements
  /vitamin|multivit|multimineral|\bmineral/, /ascorbic/, /thiamine|riboflavin|pyridoxine|cyanocobalamin|methylcobalamin|nicotinamide|niacin|pantothen|biotin/,
  /folic acid|\bfolate\b/, /ferrous|ferric|\biron\b|carbonyl iron/, /\bcalcium\b/, /chole?calciferol|colecalciferol|ergocalciferol/, /\bzinc\b/, /\bmagnesium\b/,
  /omega|fish oil|cod liver|evening primrose/, /tocopherol/, /\blutein\b|zeaxanthin/, /coenzyme|ubidecarenone|ubiquinol/, /spirulina|chlorella/,
  /\bselenium\b|\biodine\b|\bcopper\b|\bmanganese\b|chromium/, /lycopene|beta-?carotene/, /\bglucose\b|dextrose/, /protein|whey|collagen|amino acid/,
  // Antiseptics & skin care
  /chlorhexidine/, /povidone|\biodine\b/, /hydrogen peroxide/, /chloroxylenol/, /cetrimide/, /triclosan/, /isopropyl|ethanol|ethyl alcohol/,
  /zinc oxide/, /calamine/, /benzyl benzoate/, /petrolatum|petroleum|paraffin|lanolin/, /\baloe\b/, /sunscreen|titanium dioxide|avobenzone|octinoxate/,
  /\bfluoride\b/, /\bsodium chloride\b|\bsaline\b/,
  // Eye lubricants
  /carboxymethylcellulose|carmellose/, /hypromellose|hydroxypropyl methylcellulose/, /polyvinyl alcohol/, /sodium hyaluronate/,
];

/** Fine over the counter only on the skin, in the nose, or as eye/ear lubricant. */
const TOPICAL_ONLY = [
  /diclofenac/, /methyl salicylate/, /\bsalicylic acid\b/, /clotrimazole/, /miconazole/, /\bpermethrin\b/, /\burea\b/,
  /xylometazoline|oxymetazoline/,
];
const TOPICAL_FORM = /cream|ointment|\bgel\b|lotion|spray|balm|\brub\b|liniment|shampoo|soap|dusting powder|paint|nasal|patch|plaster|topical|scalp/i;

/** Never sold, even in a combination: controlled, abusable, or prescription-only by law. */
const DENY = /codeine|dextromethorphan|pseudoephedrine|\bephedrine|promethazine|diphenhydramine|doxylamine|hydroxyzine|tramadol|tapentadol|morphine|pethidine|fentanyl|nalbuphine|buprenorphine|pentazocine|\w+azepam\b|\w+zolam\b|zolpidem|clonazepam|\w+sone\b|\w+solone\b|hydrocortisone|betamethasone|\w*cillin\b|\bcef\w+|\w+mycin\b|\w+floxacin\b|\w*cycline\b|\w+nidazole\b|sildenafil|tadalafil|misoprostol|mifepristone|levonorgestrel|ulipristal|\w*estradiol|norethisterone|progesterone|testosterone|insulin|ketamine|nitrazepam|phenobarbit|pregabalin|gabapentin|methylphenidate|modafinil|isotretinoin|hydroquinone|dobesilate|steroid|yohimbine|nystatin|mebeverine|loperamide|polystyrene|calcium acetate|keto ?analog|ferric citrate|ferric maltol|datura|henbane|hyoscyamus|belladon|nux-?vomica|poppy|snake ?root|rauwolfia|stannum|cannabis|bhang|opium|fluorouracil|gefapixant/i;

const BAD_FORM = /viscoelastic|inject|infusion|\biv\b|\bim\b|\bsc\b|vial|ampoule|ampule|inhal|nebuli[sz]|rotacap|vaginal|pessary|implant/i;

/**
 * An ingredient must *start* with an allowed name: "Atorvastatin Calcium" is a statin, not calcium,
 * and "Nitroglycerin" is not glycerin.
 */
const atStart = (r: RegExp) => new RegExp(`^(?:${r.source})`, 'i');
const ANY_FORM_AT = ANY_FORM.map(atStart);
const TOPICAL_AT = TOPICAL_ONLY.map(atStart);

/** In the eye, only lubricants and saline: medicated eye drops need a doctor. */
const EYE_FORM = /ophthalmic|eye drop|eye ointment|eye gel/i;
const EYE_AT = [
  /carboxymethylcellulose|carmellose/, /hypromellose|hydroxypropyl methylcellulose/, /polyvinyl alcohol/, /sodium hyaluronate/,
  /\bsodium chloride\b|\bsaline\b/, /glycerin|glycerol/,
].map(atStart);

const DEVICE = /device|glucometer|lancet|syringe|bandage|gauze|diaper|sanitary|thermometer|nebuli[sz]er machine|test strip|mask|glove|cotton|chlorhexidine|povidone|isopropyl|ethanol|ethyl alcohol|hydrogen peroxide|chloroxylenol|halazone/i;

/** "Paracetamol + Caffeine" → both must be allowed. Vitamin lists ("B1, B6 & B12") stay one ingredient. */
const ingredients = (generic: string) => generic.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);

export interface OtcInput {
  genericName: string;
  form: string;
  /** Brand name, checked against the deny list too. */
  name?: string;
  /** Herbal, Ayurvedic, Unani and homeopathic products are sold over the counter in Bangladesh. */
  herbal?: boolean;
  /** Non-drug care items: strips, thermometers, bandages, diapers. */
  device?: boolean;
}

export type OtcResult = { ok: true } | { ok: false; reason: string };

export function otcCheck(p: OtcInput): OtcResult {
  const generic = (p.genericName ?? '').toLowerCase().trim();
  const form = p.form ?? '';
  if (BAD_FORM.test(form)) return { ok: false, reason: `${form} must be given by a professional` };
  if (DENY.test(generic) || DENY.test(p.name ?? '') || DENY.test(form)) return { ok: false, reason: 'Prescription-only or controlled ingredient' };
  if (p.herbal) return { ok: true };
  // A "device" row that names a drug is a data error, so it is checked like any medicine.
  const eye = EYE_FORM.test(form);
  if (p.device && !eye && (!generic || generic === 'unspecified' || DEVICE.test(generic))) return { ok: true };
  const parts = ingredients(generic);
  if (!parts.length) return { ok: false, reason: 'Unknown ingredient' };
  for (const part of parts) {
    if (eye) {
      if (EYE_AT.some((r) => r.test(part))) continue;
      return { ok: false, reason: 'Medicated eye products need a prescription' };
    }
    if (ANY_FORM_AT.some((r) => r.test(part))) continue;
    if (TOPICAL_AT.some((r) => r.test(part))) {
      if (TOPICAL_FORM.test(form) && !/\boral\b/i.test(`${form} ${part}`)) continue;
      return { ok: false, reason: `${part} is over the counter only on the skin` };
    }
    return { ok: false, reason: `${part} needs a prescription` };
  }
  return { ok: true };
}

export const isOtc = (p: OtcInput) => otcCheck(p).ok;
