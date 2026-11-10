/**
 * The screen a share code must pass before it is issued: it must not read as an English
 * word or as a taboo shorthand, in English or Vietnamese.
 *
 * A code is three characters from an alphabet without I, L, O and U (lib/share-code), so
 * "DOG" or "FUK" can never be issued literally — but a reader sees "D0G" as DOG and "FVK"
 * as FUK, and SEX or CAC need no help at all. So a code is screened the way a person reads
 * it, not the way it is spelt:
 *
 * - Against ordinary words (COMMON_WORDS) it is read with the substitutions the alphabet
 *   itself makes: 0 as O, 1 as I or L, V as U. That is exactly what turns D0G into DOG,
 *   and nothing further-fetched: 147 is a number, not a word.
 * - Against taboo shorthands (TABOO_WORDS, TABOO_PAIRS) it is read as generously as a
 *   teenager would: leetspeak digits (3 as E, 4 as A, 5 as S, 7 as T…) and sound-alikes
 *   (C, K and Q; S and Z; Y and I). A two-letter taboo (ĐM, VL) fails a code anywhere in it.
 *
 * Script-side only: codes are assigned offline (scripts/assign-share-codes.ts), so none of
 * these lists ever ship to a browser. A broader scan is handed off in
 * docs/share-code-screen-handoff.md.
 *
 * Exports: screenShareCode, COMMON_WORDS, TABOO_WORDS, TABOO_PAIRS
 * Depends on: nothing (pure)
 */

/** Common English three-letter words and abbreviations a reader would recognise. */
export const COMMON_WORDS: readonly string[] = `
act add ado age ago aid aim air ale all amp and ant any ape app apt arc are ark arm art
ash ask ate awe axe aye bad bag ban bar bat bay bed bee beg bet bib bid big bin bit boa
bob bog boo bow box boy bra bud bug bum bun bus but buy bye cab cad cam can cap car cat
cob cod cog con coo cop cot cow coy cry cub cue cup cur cut dab dad dam day den dew did
die dig dim din dip doc doe dog don dot dry dub dud due dug duh duo dye ear eat ebb eel
egg ego elf elk elm emo end era eve ewe eye fab fad fan far fat fax fed fee few fib fig
fin fir fit fix flu fly foe fog for fox fry fun fur gab gag gal gap gas gay gee gel gem
get gig gin god got gum gun gut guy gym had ham has hat hay hem hen her hey hid him hip
his hit hob hoe hog hop hot how hub hue hug huh hum hut ice icy ill imp ink inn ion ire
irk its ivy jab jam jar jaw jay jet jig job jog joy jug jut keg key kid kin kit lab lad
lag lap law lax lay led leg let lid lie lip lit log lot low lug mad man map mat maw max
may men met mid mix mob mod mom mop mud mug mum nab nag nap nay net new nil nip nit nod
non nor not now nun nut oak oar oat odd off oft oil old one opt orb ore our out owe owl
own pad pal pan pap par pat paw pay pea peg pen pep per pet pew pie pig pin pit ply pod
pop pot pro pry pub pug pun pup pus put rag ram ran rap rat raw ray red rib rid rig rim
rip rob rod roe rot row rub rue rug rum run rut rye sad sag sap sat saw say sea see set
sew she shy sin sip sir sis sit six ski sky sly sob sod son sop sow soy spa spy sub sue
sum sun sup tab tad tag tan tap tar tax tea ted tee ten the thy tic tie tin tip toe ton
too top tot tow toy try tub tug two urn use van vat vet vex via vie vow wad wag war was
wax way web wed wee wet who why wig win wit woe wok won woo wow wry yak yam yap yaw yay
yea yen yes yet yew yin you yum zap zen zip zit zoo
abc atm bbq cia ceo cpu dna dvd diy eta faq fbi fyi gps idk irl lol nba nfl omg omw pdf
pin pms rip rsvp smh sos tbh tmi ufo usa vip wtf www
`
  .trim()
  .split(/\s+/)
  .filter((word) => word.length === 3);

/** Taboo and slur shorthands, English and Vietnamese, read with leetspeak and sound-alikes. */
export const TABOO_WORDS: readonly string[] = [
  // English: sex, slurs, insults, hate symbols.
  "sex",
  "fuk",
  "fuc",
  "fck",
  "fuq",
  "fux",
  "cok",
  "coc",
  "kok",
  "dik",
  "dic",
  "dck",
  "cum",
  "jiz",
  "jzz",
  "ass",
  "azz",
  "tit",
  "tts",
  "fag",
  "fgt",
  "nig",
  "nga",
  "ngr",
  "kkk",
  "xxx",
  "wtf",
  "kys",
  "kms",
  "fap",
  "pmp",
  "hoe",
  "sht",
  "cnt",
  "pis",
  "poo",
  "wap",
  "bbw",
  "666",
  "420",
  "nzi",
  "cuk",
  // Vietnamese: the chat abbreviations of the strongest swears and body words.
  "vcl",
  "vkl",
  "vcc",
  "dcm",
  "dkm",
  "dmm",
  "dmn",
  "cmm",
  "cmn",
  "clm",
  "cac",
  "kac",
  "cak",
  "lon",
  "loz",
  "djt",
  "dit",
  "dyt",
  "deo",
  "ngu",
].filter((word) => word.length === 3);

/** Two-letter taboos that fail a code wherever they sit in it: ĐM (đ* m*) and VL (vãi l*). */
export const TABOO_PAIRS: readonly string[] = ["dm", "vl"];

/** What each code character can be read as, plainly: the letters the alphabet folds away. */
const PLAIN: Record<string, string> = { "0": "o0", "1": "il1", V: "vu" };

/** And as generously as possible, for taboos: leetspeak digits and sound-alikes. */
const LOOSE: Record<string, string> = {
  "0": "o0",
  "1": "il1",
  "2": "z2",
  "3": "e3",
  "4": "a4",
  "5": "s5",
  "6": "gb6",
  "7": "t7",
  "8": "b8",
  "9": "g9",
  V: "vu",
  C: "ckq",
  K: "kc",
  Q: "qk",
  S: "sz",
  Z: "zs",
  Y: "yi",
};

/** Every string a code can be read as under one table. */
function readings(code: string, table: Record<string, string>): string[] {
  let out = [""];
  for (const character of code.toUpperCase()) {
    const options = table[character] ?? character.toLowerCase();
    out = out.flatMap((prefix) => [...options].map((option) => prefix + option));
  }
  return out;
}

const COMMON = new Set(COMMON_WORDS);
const TABOO = new Set(TABOO_WORDS);

/**
 * Why a code must not be issued, or null when it may.
 * @param code - a canonical share code
 * @returns the reading it fails on, e.g. `word:dog`, `taboo:sex`, `pair:dm`; null if clean
 * @pure true
 */
export function screenShareCode(code: string): string | null {
  // A code of digits alone is a number, not a word in leetspeak: only a numeric taboo
  // itself (666, 420) fails it.
  if (!/[A-Z]/i.test(code)) return TABOO.has(code) ? `taboo:${code}` : null;
  for (const reading of readings(code, LOOSE)) {
    if (TABOO.has(reading)) return `taboo:${reading}`;
    for (const pair of TABOO_PAIRS) if (reading.includes(pair)) return `pair:${pair}`;
  }
  for (const reading of readings(code, PLAIN)) {
    if (COMMON.has(reading)) return `word:${reading}`;
  }
  return null;
}
