/**
 * The storefront's category list, and the rules that place a product in it from its generic
 * name and dosage form. Order matters: the first matching rule wins.
 *
 * `otc` marks categories that can be sold without a prescription by default. Anything else, and
 * anything matching RX_ALWAYS, is marked prescription-only, so an unknown product errs on the safe side.
 */
const c = (name, sortOrder, otc, generic, form) => ({ name, sortOrder, otc, generic, form });

const OTHER = c('Other Medicines', 99, false);

const RULES = [
  c('Medical Devices & Care', 20, true, /\b(device|glucometer|lancet|syringe|bandage|diaper|sanitary|thermometer|nebuli[sz]er machine|test strip)/i, /strip|device|machine|meter|lancet|diaper|bandage|pen needle/i),
  c('Eye & Ear', 14, false, null, /\b(eye|ear|ophthalmic|otic)\b/i),
  c('Vaccines & Immunology', 17, false, /vaccine|immunoglobulin|toxoid|antivenom/i),
  c('Cancer Care', 18, false, /fluorouracil|platin\b|taxel|rubicin|cyclophosphamide|methotrexate|capecitabine|letrozole|anastrozole|exemestane|tamoxifen|bicalutamide|enzalutamide|abiraterone|\w+tinib\b|\w+ciclib\b|\w+parib\b|\w+zomib\b|\w+rafenib\b|gemcitabine|vincristine|vinorelbine|etoposide|irinotecan|temozolomide|pemetrexed|hydroxyurea|hydroxycarbamide|lenalidomide|thalidomide|rituximab|trastuzumab|bevacizumab|filgrastim/i),
  c('Diabetes', 2, false, /metformin|\w+gliptin\b|\w+gliflozin\b|gliclazide|glimepiride|glibenclamide|glipizide|insulin|pioglitazone|\w+glutide\b|acarbose|voglibose|miglitol|repaglinide|nateglinide/i),
  c('Heart & Blood Pressure', 3, false, /\w+sartan\b|\w+pril\b|\w+olol\b|\w+dipine\b|\w+statin\b|hydrochlorothiazide|chlorthalidone|indapamide|furosemide|frusemide|spironolactone|eplerenone|torsemide|torasemide|bumetanide|nitroglycerin|glyceryl trinitrate|trimetazidine|clopidogrel|prasugrel|ticagrelor|rivaroxaban|apixaban|dabigatran|warfarin|enoxaparin|heparin|ivabradine|amiodarone|digoxin|fenofibrate|gemfibrozil|ezetimibe|ranolazine|isosorbide|methyldopa|prazosin|sacubitril|nicorandil|verapamil|diltiazem|hydralazine|clonidine|alteplase|streptokinase/i),
  c('Antivirals, Antifungals & Antiparasitics', 5, false, /\w+vir\b|\w+conazole\b|terbinafine|griseofulvin|nystatin|amphotericin|albendazole|mebendazole|pyrantel|levamisole|ivermectin|praziquantel|nitazoxanide|artemether|lumefantrine|chloroquine|quinine|primaquine|miltefosine|sofosbuvir/i),
  c('Stomach & Digestion', 4, true, /\w+prazole\b|\w+tidine\b|antacid|aluminium|aluminum|magnesium hydroxide|magaldrate|simethicone|domperidone|ondansetron|metoclopramide|palonosetron|granisetron|loperamide|lactulose|bisacodyl|ispaghula|psyllium|sodium picosulfate|polyethylene glycol|macrogol|oral rehydration|rehydration salt|probiotic|lactobacillus|saccharomyces|bacillus|mebeverine|drotaverine|hyoscine|tiemonium|pinaverium|otilonium|ursodeoxycholic|sucralfate|itopride|mosapride|prucalopride|rifaximin|pancreatin|pancrelipase|silymarin|vonoprazan|mesalazine|sulfasalazine/i),
  c('Antibiotics', 1, false, /\w*cillin\b|\bcef\w+|\bceph\w+|\w+penem\b|\w+mycin\b|\w+micin\b|\w+floxacin\b|\w*cycline\b|sulph?amethoxazole|trimethoprim|\w+nidazole\b|nitrofurantoin|linezolid|colistin|polymyxin|fosfomycin|aztreonam|vancomycin|teicoplanin|fusidic|mupirocin|rifampi|isoniazid|ethambutol|pyrazinamide|bedaquiline|clavulanic|tazobactam|sulbactam|chloramphenicol|tigecycline/i),
  c('Skin & Hair', 7, true, /minoxidil|isotretinoin|tretinoin|adapalene|benzoyl peroxide|permethrin|calamine|salicylic|urea|hydroquinone|azelaic|clobetasol|mometasone|betamethasone|tacrolimus|pimecrolimus|biotin|sunscreen|zinc oxide|ketoconazole/i, /cream|ointment|\bgel\b|lotion|shampoo|topical|soap|scalp|dusting powder|medicated bar/i),
  c('Asthma & Breathing', 6, false, /salbutamol|levosalbutamol|albuterol|formoterol|salmeterol|tiotropium|ipratropium|montelukast|zafirlukast|theophylline|aminophylline|doxofylline|bambuterol|roflumilast/i, /inhal|rotacap|respirator|nebuli[sz]er|evohaler|accuhaler/i),
  c('Cold & Allergy', 8, true, /\w+tadine\b|cetirizine|levocetirizine|chlorphenamine|chlorpheniramine|pheniramine|rupatadine|ketotifen|hydroxyzine|bilastine|ebastine|diphenhydramine|promethazine|phenylephrine|pseudoephedrine|xylometazoline|oxymetazoline|dextromethorphan|ambroxol|bromhexine|guaifenesin|guaiphenesin|carbocisteine|acetylcysteine|butamirate|levodropropizine|cough/i, /nasal/i),
  c('Women\'s Health', 10, false, /progesterone|\w*estradiol|estrogen|oestrogen|norethisterone|norethindrone|levonorgestrel|ulipristal|desogestrel|drospirenone|dienogest|gestodene|medroxyprogesterone|clomiphene|clomifene|misoprostol|mifepristone|oxytocin|carbetocin|ergometrine|methylergometrine|dydrogesterone|contracepti|tibolone|cabergoline|bromocriptine|ritodrine|isoxsuprine/i, /vaginal|pessary/i),
  c('Men\'s Health & Urology', 11, false, /sildenafil|tadalafil|vardenafil|avanafil|dapoxetine|tamsulosin|silodosin|alfuzosin|finasteride|dutasteride|solifenacin|mirabegron|flavoxate|tolterodine|darifenacin|trospium|oxybutynin|potassium citrate/i),
  c('Hormones & Thyroid', 12, false, /levothyroxine|thyroxine|carbimazole|methimazole|propylthiouracil|prednisolone|prednisone|dexamethasone|methylprednisolone|hydrocortisone|deflazacort|triamcinolone|testosterone|nandrolone|somatropin|desmopressin|fludrocortisone/i),
  c('Brain, Nerves & Mental Health', 9, false, /\w+oxetine\b|sertraline|\w*citalopram|paroxetine|fluvoxamine|venlafaxine|desvenlafaxine|mirtazapine|bupropion|amitriptyline|nortriptyline|imipramine|\w+azepam\b|\w+zolam\b|clobazam|zolpidem|olanzapine|risperidone|quetiapine|aripiprazole|paliperidone|clozapine|haloperidol|flupent|amisulpride|chlorpromazine|lithium|valpro|divalproex|carbamazepine|oxcarbazepine|levetiracetam|lamotrigine|topiramate|phenytoin|phenobarbital|lacosamide|pregabalin|gabapentin|flunarizine|cinnarizine|betahistine|donepezil|memantine|rivastigmine|levodopa|carbidopa|pramipexole|ropinirole|rasagiline|trihexyphenidyl|procyclidine|melatonin|piracetam|citicoline|sumatriptan|\w+triptan\b|pizotifen|propranolol/i),
  c('Bone, Joint & Gout', 13, false, /allopurinol|febuxostat|colchicine|\w+dronate\b|\w+dronic\b|glucosamine|chondroitin|diacerein|strontium|teriparatide|denosumab|hyaluron|leflunomide|hydroxychloroquine|tofacitinib/i),
  c('Fever & Pain', 0, true, /paracetamol|acetaminophen|ibuprofen|naproxen|diclofenac|aceclofenac|etodolac|\w+coxib\b|ketorolac|ketoprofen|flurbiprofen|dexketoprofen|tramadol|tapentadol|morphine|pethidine|fentanyl|nalbuphine|buprenorphine|pentazocine|tolfenamic|mefenamic|nimesulide|piroxicam|meloxicam|tenoxicam|lornoxicam|aspirin|acetylsalicylic|tizanidine|baclofen|eperisone|thiocolchicoside|orphenadrine|tolperisone|cyclobenzaprine|serratiopeptidase|bromelain/i),
  c('Vitamins & Supplements', 15, true, /vitamin|multivit|multimineral|\bcalcium\b|\biron\b|ferrous|ferric|folic|\bzinc\b|magnesium|selenium|cholecalciferol|ergocalciferol|calcitriol|alfacalcidol|thiamine|riboflavin|niacin|pyridoxine|cobalamin|ascorbic|tocopherol|omega|fish oil|lutein|coenzyme|ubidecarenone|l-?carnitine|amino acid|protein|collagen|\bginseng\b|spirulina/i),
  c('IV Fluids & Hospital Care', 16, false, /saline|sodium chloride|dextrose|glucose|ringer|hartmann|water for injection|potassium chloride|albumin|mannitol|bupivacaine|lidocaine|lignocaine|ketamine|propofol|midazolam|sevoflurane|isoflurane|atracurium|vecuronium|rocuronium|suxamethonium|neostigmine|atropine|adrenaline|epinephrine|noradrenaline|dopamine|dobutamine|iohexol|iopamidol|gadolinium|contrast|tranexamic/i, /infusion|\biv fluid/i),
];

export const CATEGORIES = [...RULES, OTHER, c('Herbal & Natural', 19, true)];
const HERBAL = CATEGORIES.at(-1);

/** Prescription-only whatever the category: anti-infectives, steroids, strong analgesics, sedatives. */
const RX_ALWAYS = /\w*cillin\b|\bcef\w+|\bceph\w+|\w+penem\b|\w+mycin\b|\w+micin\b|\w+floxacin\b|\w*cycline\b|sulph?amethoxazole|\w+nidazole\b|fusidic|mupirocin|tramadol|tapentadol|morphine|pethidine|fentanyl|nalbuphine|buprenorphine|pentazocine|\w+azepam\b|\w+zolam\b|betamethasone|clobetasol|mometasone|hydrocortisone|isotretinoin|ketorolac/i;

const isInjectable = (form) => /inject|infusion|\biv\b|\bim\b|\bsc\b|vial|ampoule/i.test(form);

/** @param {{ genericName: string, form: string, type?: string }} p */
export function categorize({ genericName, form, type = '' }) {
  const herbal = /herbal|ayurved|unani|homeo/i.test(type);
  const rule = herbal ? HERBAL : RULES.find((r) => r.generic?.test(genericName) || r.form?.test(form)) ?? OTHER;
  const isRx = !rule.otc || isInjectable(form) || RX_ALWAYS.test(genericName);
  return { category: rule, isRx: herbal ? false : isRx };
}
