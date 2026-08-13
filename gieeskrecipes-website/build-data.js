#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   GieesK — Data Splitter
   ───────────────────────────────────────────────────────────────
   Turns the monolithic js/data.js into:

     data/index.json        light catalogue — every recipe, browse
                            fields only. Loaded once, upfront.
     data/recipes/<ID>.json full detail — fetched on demand when a
                            recipe is actually opened.

   Run after editing data.js:   node build-data.js
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

// ── Fields needed to render a card / run a search ───────────────
const INDEX_FIELDS = [
  'id','title','localName','emoji','country','countryFlag','cuisine',
  'category','course','diff','time','prepTime','cookTime','servings',
  'cal','rating','reviews','tags','collections','desc',
  'author','authorEmoji','image'
];

console.log('Reading js/data.js…');
const src = fs.readFileSync(path.join(__dirname,'js','data.js'),'utf8');

// ── Photo URLs live in a separate file, NOT in data.js ───────────
// data.js is hand-maintained; photos are fetched by a script (Pexels
// API) and would be wiped out every time this build regenerates
// data/ from data.js. Keeping them in data/images-map.json means
// they survive every rebuild — this file merges them back in below.
const IMAGES_MAP_PATH = path.join(__dirname, 'data', 'images-map.json');
let imagesMap = {};
if (fs.existsSync(IMAGES_MAP_PATH)) {
  imagesMap = JSON.parse(fs.readFileSync(IMAGES_MAP_PATH, 'utf8'));
  console.log(`Loaded ${Object.keys(imagesMap).length} photo URLs from images-map.json.`);
} else {
  console.log('No images-map.json found — recipes will have no photos yet.');
}

// Evaluate data.js in a sandbox to get the RECIPES array
const sandbox = { window:{}, document:{} };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(src + '\n;__OUT__ = (typeof RECIPES!=="undefined")?RECIPES:null;', sandbox);
const RECIPES = sandbox.__OUT__;

if (!Array.isArray(RECIPES)) {
  console.error('❌ Could not read RECIPES array from data.js');
  process.exit(1);
}
console.log(`Loaded ${RECIPES.length} recipes.`);

// ── Integrity: duplicate IDs silently overwrite detail files ────
const idSeen = new Map();
const dupes = [];
RECIPES.forEach((r, i) => {
  if (!r.id) { dupes.push(`index ${i} has no id ("${r.title||'?'}")`); return; }
  if (idSeen.has(r.id)) {
    dupes.push(`${r.id} used twice — "${idSeen.get(r.id)}" and "${r.title}"`);
  } else idSeen.set(r.id, r.title);
});
if (dupes.length) {
  console.error('\n❌ DUPLICATE / MISSING IDs — detail files would overwrite each other:');
  dupes.forEach(d => console.error('   ' + d));
  console.error('\nFix these in js/data.js before shipping.\n');
  process.exit(1);
}
console.log('✅ All recipe IDs unique.');

// ── Build a compact search blob per recipe ──────────────────────
// Full ingredient lines are heavy ("2 tbsp kibbeh (ETH143)").
// We keep only distinctive words, deduped — search stays accurate,
// payload stays small.
const STOP = new Set(['and','the','for','with','into','from','plus','then',
  'tbsp','tsp','cup','cups','g','kg','ml','litre','litres','oz','lb','large',
  'small','medium','fresh','dried','ground','chopped','sliced','diced','minced',
  'optional','to','taste','or','of','a','an','see','use','per','about','each',
  'finely','roughly','thinly','halved','quartered','peeled','washed','cut',
  'pieces','piece','whole','extra','more','less','if','needed','room','temperature']);

function searchBlob(r) {
  // Only what ISN'T already an index field. title/desc/tags/cuisine/country
  // are searched directly, so duplicating them here is wasted bytes.
  const bits = [];
  if (Array.isArray(r.keywords))    bits.push(r.keywords.join(' '));
  if (Array.isArray(r.ingredients)) bits.push(r.ingredients.join(' '));

  const words = bits.join(' ').toLowerCase()
    .replace(/\([^)]*\)/g,' ')          // drop "(ETH143)" cross-refs
    .replace(/\/\/[^,]*/g,' ')           // drop "// section" comment lines
    .replace(/[^a-z0-9\u00C0-\u024F' ]+/g,' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w) && !/^\d/.test(w));

  // cap at the 34 most distinctive terms — beyond that adds bytes, not recall
  return [...new Set(words)].slice(0, 34).join(' ');
}

// Cards truncate long copy anyway; the full desc lives in the detail file.
function shortDesc(d) {
  if (!d) return '';
  if (d.length <= 150) return d;
  const cut = d.slice(0, 150);
  const sp = cut.lastIndexOf(' ');
  return (sp > 110 ? cut.slice(0, sp) : cut) + '…';
}

// ── Emit ────────────────────────────────────────────────────────
const outDir  = path.join(__dirname,'data');
const fullDir = path.join(outDir,'recipes');
fs.mkdirSync(fullDir,{recursive:true});

// clear stale detail files
fs.readdirSync(fullDir).forEach(f => {
  if (f.endsWith('.json')) fs.unlinkSync(path.join(fullDir,f));
});

const index = [];
let fullBytes = 0;

RECIPES.forEach(r => {
  // Merge in the photo URL (if we have one for this recipe) BEFORE
  // splitting into index/detail — this way it survives every rebuild.
  const photo = imagesMap[r.id];
  if (photo) {
    r.image = photo.image;
    if (photo.imageCredit) r.imageCredit = photo.imageCredit;
  }

  const light = {};
  INDEX_FIELDS.forEach(k => { if (r[k] !== undefined) light[k] = r[k]; });
  if (light.desc) light.desc = shortDesc(light.desc);
  light.s = searchBlob(r);           // 's' = search blob (short key saves bytes)
  index.push(light);

  const json = JSON.stringify(r);
  fullBytes += json.length;
  fs.writeFileSync(path.join(fullDir, `${r.id}.json`), json);
});

const indexJson = JSON.stringify(index);
fs.writeFileSync(path.join(outDir,'index.json'), indexJson);

// ── Supporting globals: CUISINES, CHEFS, BADGES, LEADERBOARD, etc. ──
// These are NOT part of the RECIPES array — they're separate top-level
// consts in data.js (site chrome: chef bios, leaderboard, cuisine list,
// AI canned responses). Small (a few KB total), so unlike RECIPES they
// don't need lazy-loading — they ship as a plain script, loaded once.
//
// IMPORTANT: data.js itself is NOT sent to the browser (index.html loads
// data-loader.js instead) — so anything defined in data.js that isn't
// captured here silently disappears from the live site. If you add a
// new top-level const to data.js that other scripts depend on, add its
// name to SITE_GLOBALS below or it won't ship.
const SITE_GLOBALS = ['COUNTRY_REGISTRY','CUISINES','CHEFS','BADGES','AI_RESPONSES'];
const globals = {};
SITE_GLOBALS.forEach(g => {
  vm.runInContext(`try{__G__=${g};}catch(e){__G__=undefined;}`, sandbox);
  globals[g] = sandbox.__G__;
});

const missing = SITE_GLOBALS.filter(g => globals[g] === undefined);
if (missing.length) {
  console.warn(`⚠  Not found in data.js, skipped: ${missing.join(', ')}`);
}

const siteDataJs =
  '/* AUTO-GENERATED by build-data.js — do not edit directly.\n' +
  '   Small supporting datasets from data.js that the browser needs\n' +
  '   directly (unlike RECIPES, these are too small to lazy-load). */\n' +
  SITE_GLOBALS.filter(g => globals[g] !== undefined)
    .map(g => `const ${g} = ${JSON.stringify(globals[g])};`)
    .join('\n') + '\n';

fs.writeFileSync(path.join(__dirname,'js','site-data.js'), siteDataJs);
console.log(`✅ js/site-data.js written (${SITE_GLOBALS.length - missing.length}/${SITE_GLOBALS.length} globals, ${(siteDataJs.length/1024).toFixed(1)} KB)`);

// ── Keep homepage hero stats honest ──────────────────────────────
// These were hardcoded placeholders (50,000 recipes, 195 countries,
// 2,400 chefs — all wildly overstated vs the real 909/11/9) that never
// updated as recipes were added. Since RECIPES/CHEFS are already loaded
// here, rewrite the actual figures into index.html on every build — so
// the hero always matches reality without anyone remembering to hand-edit
// three numbers whenever recipes are added.
//
// "Cooks" is left alone — it's a user/traffic metric, not something
// derivable from the recipe dataset, so there's no "real" value to sync it to.
const indexHtmlPath = path.join(__dirname, 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

const realCountryCount = new Set(RECIPES.map(r => r.country).filter(Boolean)).size;
const realChefCount = (globals.CHEFS || []).length;

const statTargets = {
  Recipes:   RECIPES.length,
  Countries: realCountryCount,
  Chefs:     realChefCount
};

let statsUpdated = 0;
Object.entries(statTargets).forEach(([label, value]) => {
  const re = new RegExp(
    `(<span class="stat-num" data-target=")\\d+("[^>]*>0</span><span class="stat-label">${label}</span>)`
  );
  if (re.test(indexHtml)) {
    indexHtml = indexHtml.replace(re, `$1${value}$2`);
    statsUpdated++;
  } else {
    console.warn(`⚠  Could not find hero stat block for "${label}" — skipped`);
  }
});

fs.writeFileSync(indexHtmlPath, indexHtml);
console.log(`✅ Homepage hero stats synced (${statsUpdated}/3): ${RECIPES.length} recipes, ${realCountryCount} countries, ${realChefCount} chefs`);

// The animated counter stats above are a separate piece of markup from
// the hero tagline text and the SEO-facing JSON-LD description — both
// had their OWN independent hardcoded "50,000+ recipes" / "195
// countries" that the counter fix never touched, discovered by actually
// screenshotting the rendered homepage rather than just checking the
// counters. Fix those here too, same reasoning: never hand-typed again.
indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const before1 = indexHtml;

indexHtml = indexHtml.replace(
  /Explore [\d,]+\+? recipes from every corner of the globe/,
  `Explore ${RECIPES.length}+ recipes from every corner of the globe`
);
indexHtml = indexHtml.replace(
  /\d+ countries, [\d,]+\+? authentic recipes/,
  `${realCountryCount} countries, ${RECIPES.length}+ authentic recipes`
);
indexHtml = indexHtml.replace(
  /[\d,]+\+ authentic recipes from every corner of the globe/g,
  `${RECIPES.length}+ authentic recipes from every corner of the globe`
);

const alreadyCorrect =
  indexHtml.includes(`Explore ${RECIPES.length}+ recipes from every corner of the globe`) &&
  indexHtml.includes(`${realCountryCount} countries, ${RECIPES.length}+ authentic recipes`);

if (indexHtml !== before1) {
  fs.writeFileSync(indexHtmlPath, indexHtml);
  console.log(`✅ Hero tagline, JSON-LD, and social meta descriptions synced to ${RECIPES.length} recipes, ${realCountryCount} countries`);
} else if (alreadyCorrect) {
  console.log(`✅ Hero tagline, JSON-LD, and social meta descriptions already up to date (${RECIPES.length} recipes, ${realCountryCount} countries)`);
} else {
  console.warn('⚠  Could not find hero tagline / JSON-LD / social meta text to sync — check for wording changes');
}

// ── Keep World Cuisines counts honest ────────────────────────────
// Found via an actual mobile screen recording: cards showing "Indian
// 3.6k recipes" (real: 1), "Chinese 4.1k recipes" (real: 0 — China
// isn't even one of the countries with real recipes), etc. Only
// Ethiopian/Kenyan/Tanzanian happened to be correct, and even
// "Italian: 65" had already drifted one recipe stale from manual
// updates across sessions. Computing this at build time, same as the
// hero stats, means it can't go stale again regardless of how many
// recipes get added later.
const dataJsPath = path.join(__dirname, 'js', 'data.js');
let dataJsSrc = fs.readFileSync(dataJsPath, 'utf8');

const countByCountry = {};
RECIPES.forEach(r => { if (r.country) countByCountry[r.country] = (countByCountry[r.country] || 0) + 1; });

// Maps each CUISINES card's display name to the real `country` field
// used on RECIPES — several of these (French, Lebanese, Chinese,
// Greek, Peruvian) currently have zero matching recipes at all, and
// will correctly show 0 rather than a fabricated number until real
// recipes for those countries actually exist.
const cuisineToCountry = {
  Italian: 'Italy', Japanese: 'Japan', Mexican: 'Mexico', Indian: 'India',
  Thai: 'Thailand', Moroccan: 'Morocco', French: 'France', Lebanese: 'Lebanon',
  Chinese: 'China', Greek: 'Greece', Ethiopian: 'Ethiopia', Peruvian: 'Peru',
  Kenyan: 'Kenya', Tanzanian: 'Tanzania',
};

let cuisinesUpdated = 0;
Object.entries(cuisineToCountry).forEach(([cuisineName, countryName]) => {
  const realCount = countByCountry[countryName] || 0;
  const re = new RegExp(`(\\{\\s*name:\\s*'${cuisineName}'[^}]*count:\\s*)\\d+`);
  if (re.test(dataJsSrc)) {
    dataJsSrc = dataJsSrc.replace(re, `$1${realCount}`);
    cuisinesUpdated++;
  } else {
    console.warn(`⚠  Could not find CUISINES entry for "${cuisineName}" — skipped`);
  }
});

fs.writeFileSync(dataJsPath, dataJsSrc);
console.log(`✅ CUISINES counts synced (${cuisinesUpdated}/${Object.keys(cuisineToCountry).length}): ` +
  Object.entries(cuisineToCountry).map(([n,c]) => `${n}=${countByCountry[c]||0}`).join(', '));

const zlib = require('zlib');
const gz = s => zlib.gzipSync(Buffer.from(s)).length;
const mb = b => (b/1048576).toFixed(2);
const kb = b => (b/1024).toFixed(0);

const origRaw = fs.statSync(path.join(__dirname,'js','data.js')).size;
const origGz  = gz(src);
const idxGz   = gz(indexJson);

console.log('\n' + '═'.repeat(58));
console.log('BEFORE — every visitor downloaded the whole database');
console.log(`  js/data.js          ${mb(origRaw)} MB raw   ${mb(origGz)} MB gzipped`);
console.log('\nAFTER — visitors download the catalogue only');
console.log(`  data/index.json     ${mb(indexJson.length)} MB raw   ${mb(idxGz)} MB gzipped`);
console.log(`  data/recipes/*.json ${RECIPES.length} files, ${kb(fullBytes/RECIPES.length)} KB avg — fetched on demand`);
console.log('\nInitial payload reduction: ' +
  (100 - (idxGz/origGz*100)).toFixed(1) + '%  (' +
  mb(origGz - idxGz) + ' MB saved per first visit)');
console.log('═'.repeat(58));