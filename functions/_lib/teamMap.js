// Maps football-data.org team names/TLAs to our canonical 48 names.
// Built to be tolerant: it normalizes (lowercase, strips accents/punctuation)
// and checks a list of known aliases per team, then falls back to the TLA.
// Anything it can't match is reported by the /api/health check so you can
// catch a naming mismatch BEFORE the tournament — and the admin override can
// always fix a group by hand if needed.

export function normalize(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// canonical -> list of accepted name variants (will be normalized on load)
const ALIASES = {
  "Mexico": ["mexico"],
  "South Korea": ["south korea", "korea republic", "republic of korea", "korea south", "korea"],
  "South Africa": ["south africa"],
  "Czechia": ["czechia", "czech republic"],
  "Canada": ["canada"],
  "Switzerland": ["switzerland"],
  "Qatar": ["qatar"],
  "Bosnia and Herzegovina": ["bosnia and herzegovina", "bosnia herzegovina", "bosnia & herzegovina", "bosnia-herzegovina", "bosnia"],
  "Brazil": ["brazil"],
  "Scotland": ["scotland"],
  "Morocco": ["morocco"],
  "Haiti": ["haiti"],
  "United States": ["united states", "usa", "united states of america", "us"],
  "Paraguay": ["paraguay"],
  "Australia": ["australia"],
  "Türkiye": ["turkiye", "turkey", "tuerkiye"],
  "Germany": ["germany"],
  "Ecuador": ["ecuador"],
  "Ivory Coast": ["ivory coast", "cote d ivoire", "cote divoire", "cote d'ivoire", "ivorycoast"],
  "Curaçao": ["curacao"],
  "Netherlands": ["netherlands", "holland"],
  "Japan": ["japan"],
  "Tunisia": ["tunisia"],
  "Sweden": ["sweden"],
  "Belgium": ["belgium"],
  "Iran": ["iran", "ir iran", "iran islamic republic of", "islamic republic of iran"],
  "Egypt": ["egypt"],
  "New Zealand": ["new zealand"],
  "Spain": ["spain"],
  "Uruguay": ["uruguay"],
  "Saudi Arabia": ["saudi arabia"],
  "Cape Verde": ["cape verde", "cabo verde"],
  "France": ["france"],
  "Norway": ["norway"],
  "Senegal": ["senegal"],
  "Iraq": ["iraq"],
  "Argentina": ["argentina"],
  "Austria": ["austria"],
  "Algeria": ["algeria"],
  "Jordan": ["jordan"],
  "Portugal": ["portugal"],
  "Colombia": ["colombia"],
  "Uzbekistan": ["uzbekistan"],
  "DR Congo": ["dr congo", "congo dr", "democratic republic of the congo", "democratic republic of congo", "congo democratic republic", "congo kinshasa", "dr congo dem rep"],
  "England": ["england"],
  "Croatia": ["croatia"],
  "Ghana": ["ghana"],
  "Panama": ["panama"],
};

// common FIFA/football-data 3-letter codes -> canonical (secondary fallback)
const TLA = {
  MEX: "Mexico", KOR: "South Korea", RSA: "South Africa", RKR: "South Korea",
  CZE: "Czechia", CAN: "Canada", SUI: "Switzerland", QAT: "Qatar", BIH: "Bosnia and Herzegovina",
  BRA: "Brazil", SCO: "Scotland", MAR: "Morocco", HAI: "Haiti", HAÏ: "Haiti",
  USA: "United States", PAR: "Paraguay", PAY: "Paraguay", AUS: "Australia", TUR: "Türkiye",
  GER: "Germany", ECU: "Ecuador", CIV: "Ivory Coast", CUW: "Curaçao", CUR: "Curaçao",
  NED: "Netherlands", HOL: "Netherlands", JPN: "Japan", TUN: "Tunisia", SWE: "Sweden",
  BEL: "Belgium", IRN: "Iran", IRA: "Iran", EGY: "Egypt", NZL: "New Zealand",
  ESP: "Spain", URU: "Uruguay", KSA: "Saudi Arabia", SAU: "Saudi Arabia", CPV: "Cape Verde",
  FRA: "France", NOR: "Norway", SEN: "Senegal", IRQ: "Iraq",
  ARG: "Argentina", AUT: "Austria", ALG: "Algeria", DZA: "Algeria", JOR: "Jordan",
  POR: "Portugal", PRT: "Portugal", COL: "Colombia", UZB: "Uzbekistan", COD: "DR Congo", DRC: "DR Congo",
  ENG: "England", CRO: "Croatia", GHA: "Ghana", PAN: "Panama",
};

// Build a normalized lookup once.
const NAME_LOOKUP = {};
for (const [canon, variants] of Object.entries(ALIASES)) {
  for (const v of variants) NAME_LOOKUP[normalize(v)] = canon;
}

export function mapTeam(name, tla) {
  const n = normalize(name);
  if (n && NAME_LOOKUP[n]) return NAME_LOOKUP[n];
  if (tla && TLA[tla.toUpperCase()]) return TLA[tla.toUpperCase()];
  // last resort: a normalized variant contained in the incoming name
  for (const key in NAME_LOOKUP) {
    if (n && (n === key || n.includes(key) || key.includes(n))) return NAME_LOOKUP[key];
  }
  return null;
}

export const CANONICAL_TEAMS = Object.keys(ALIASES);
