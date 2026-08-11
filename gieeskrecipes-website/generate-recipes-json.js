/**
 * GieesK Recipes — Auto-generate recipes.json from data.js
 * Runs: node generate-recipes-json.js
 */

const fs   = require('fs');
const path = require('path');

console.log('GieesK Recipes: Generating recipes.json...');

// Find data.js - check multiple possible locations
const possiblePaths = [
  path.join(__dirname, 'js', 'data.js'),
  path.join(process.cwd(), 'js', 'data.js'),
  path.join(process.cwd(), 'gieeskrecipes', 'js', 'data.js'),
];

let dataPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) { dataPath = p; break; }
}

if (!dataPath) {
  console.error('ERROR: Cannot find js/data.js');
  console.error('Searched:', possiblePaths);
  process.exit(1);
}

console.log('Found data.js at:', dataPath);
const baseDir = path.dirname(path.dirname(dataPath)); // parent of js/

// Write temp module
const tmpPath = path.join(baseDir, '_tmp_gieeskrecipes_data.js');
const code = fs.readFileSync(dataPath, 'utf8');
fs.writeFileSync(tmpPath, code + '\nmodule.exports={RECIPES,CUISINES,CHEFS,BADGES,LEADERBOARD};');

let RECIPES, CUISINES;
try {
  // Clear cache in case of repeated runs
  delete require.cache[require.resolve(tmpPath)];
  const mod = require(tmpPath);
  RECIPES  = mod.RECIPES;
  CUISINES = mod.CUISINES;
} catch(e) {
  console.error('ERROR loading data.js:', e.message);
  fs.unlinkSync(tmpPath);
  process.exit(1);
} finally {
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
}

if (!RECIPES || !RECIPES.length) {
  console.error('ERROR: RECIPES is empty');
  process.exit(1);
}

console.log('Loaded ' + RECIPES.length + ' recipes');

const output = {
  version:       '1.0',
  generated:     new Date().toISOString(),
  platform:      'GieesK Recipes',
  website:       'https://gieesk.com',
  description:   'GieesK Recipes global recipe database — auto-generated JSON',
  total_recipes: RECIPES.length,
  cuisines: (CUISINES || []).map(function(c) {
    return { name: c.name, flag: c.flag, count: c.count, color: c.color };
  }),
  recipes: RECIPES.map(function(r) {
    return {
      id:                 r.id,
      title:              r.title,
      localName:          r.localName          || null,
      emoji:              r.emoji,
      country:            r.country,
      countryFlag:        r.countryFlag        || null,
      kenyanRegion:       r.kenyanRegion       || null,
      community:          r.community          || null,
      cuisine:            r.cuisine,
      category:           r.category,
      course:             r.course,
      difficulty:         r.diff,
      times: {
        prep:     r.prepTime     || 0,
        cook:     r.cookTime     || 0,
        rest:     r.restTime     || 0,
        marinate: r.marinateTime || 0,
        total:    r.time         || 0
      },
      servings:           r.servings,
      yieldDesc:          r.yieldDesc          || null,
      calories:           r.cal,
      rating:             r.rating,
      reviews:            r.reviews,
      tags:               r.tags               || [],
      collections:        r.collections        || [],
      description:        r.desc               || null,
      longDescription:    r.longDesc           || null,
      ingredients:        r.ingredients        || [],
      substitutions:      r.substitutions      || [],
      equipment:          r.equipment          || [],
      steps:              r.steps              || [],
      chefTips:           r.chefTips           || [],
      commonMistakes:     r.commonMistakes      || [],
      nutrition:          r.nutrition           || {},
      meta:               r.meta                || {},
      regionalMap:        r.regionalMap         || null,
      heritage:           r.heritage            || null,
      spiceBlend:         r.spiceBlend          || null,
      techniques:         r.techniques          || [],
      servedWith:         r.servedWith          || [],
      relatedRecipes:     r.relatedRecipes      || [],
      relatedDish:        r.relatedDish         || null,
      variantOf:          r.variantOf           || null,
      masterRecipe:       r.masterRecipe        || null,
      storage:            r.storage             || null,
      reheating:          r.reheating           || null,
      healthBenefits:     r.healthBenefits      || [],
      culturalNote:       r.culturalNote        || null,
      regionalVariations: r.regionalVariations  || [],
      faqs:               r.faqs                || [],
      cookingScience:     r.cookingScience      || null,
      sustainabilityTips: r.sustainabilityTips  || [],
      keywords:           r.keywords            || []
    };
  })
};

const outPath = path.join(baseDir, 'recipes.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('recipes.json written — ' + output.total_recipes + ' recipes, ' + sizeKB + 'KB');
console.log('Build complete!');
