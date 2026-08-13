// build-images-map.js
// ═══════════════════════════════════════════════════════════════
// Run ONCE to migrate photo URLs you've already fetched (currently
// sitting in data/recipes/*.json) into the new persistent file,
// data/images-map.json. This file is NOT touched by build-data.js's
// regeneration, so photos will survive every future build/deploy.
//
// Usage:  node build-images-map.js
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, 'data', 'recipes');
const OUT_PATH = path.join(__dirname, 'data', 'images-map.json');

const files = fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith('.json'));
const map = {};
let found = 0;

for (const file of files) {
  const recipe = JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, file), 'utf8'));
  if (recipe.image) {
    map[recipe.id] = { image: recipe.image };
    if (recipe.imageCredit) map[recipe.id].imageCredit = recipe.imageCredit;
    found++;
  }
}

fs.writeFileSync(OUT_PATH, JSON.stringify(map), 'utf8');
console.log(`✅ Extracted ${found} photo URLs (of ${files.length} recipe files) into data/images-map.json`);
console.log('Now run: node build-data.js   (to verify photos survive a rebuild)');