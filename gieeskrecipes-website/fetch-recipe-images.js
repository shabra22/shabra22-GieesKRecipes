// fetch-recipe-images.js
// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — Real Photo Fetcher
// ───────────────────────────────────────────────────────────────
// Loops through every recipe in data/recipes/*.json, searches
// Pexels for a real photo matching the dish name, and saves the
// photo URL into the recipe's "image" field. Also updates the
// matching entry in data/index.json so recipe cards can use it.
//
// Setup:
//   1. Get a free API key at https://www.pexels.com/api/
//   2. Run with your key set as an environment variable:
//        Windows (PowerShell):  $env:PEXELS_API_KEY="your_key_here"; node fetch-recipe-images.js
//        Mac/Linux:              PEXELS_API_KEY=your_key_here node fetch-recipe-images.js
//
// Safe to re-run: recipes that already have an "image" field are
// skipped, so if it stops partway (rate limit, network blip) just
// run it again and it'll pick up where it left off.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.PEXELS_API_KEY;
const RECIPES_DIR = path.join(__dirname, 'data', 'recipes');
const INDEX_PATH = path.join(__dirname, 'data', 'index.json');
const DELAY_MS = 300; // ~3 requests/sec — well under Pexels' rate limit

if (!API_KEY) {
  console.error('❌ Missing PEXELS_API_KEY environment variable.');
  console.error('   Get a free key at https://www.pexels.com/api/ and set it before running.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchPexels(query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: API_KEY } });

  if (res.status === 429) {
    console.warn('   ⏳ Rate limited — waiting 60s...');
    await sleep(60000);
    return searchPexels(query); // retry once after cooling down
  }

  if (!res.ok) {
    throw new Error(`Pexels API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  if (data.photos && data.photos.length > 0) {
    return {
      url: data.photos[0].src.large,
      photographer: data.photos[0].photographer,
      photographerUrl: data.photos[0].photographer_url,
    };
  }
  return null;
}

async function main() {
  const files = fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} recipe files.\n`);

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const indexById = new Map(index.map((r) => [String(r.id), r]));

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(RECIPES_DIR, file);
    const recipe = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (recipe.image) {
      skipped++;
      continue; // already has a photo — safe to re-run the script
    }

    // Search using the dish name plus "food" to bias toward food photography
    const query = `${recipe.title} ${recipe.cuisine || ''} food`.trim();

    try {
      process.stdout.write(`[${i + 1}/${files.length}] ${recipe.title}... `);
      const result = await searchPexels(query);

      if (result) {
        recipe.image = result.url;
        recipe.imageCredit = `Photo by ${result.photographer} on Pexels`;
        fs.writeFileSync(filePath, JSON.stringify(recipe), 'utf8');

        // Mirror into index.json too, if this recipe is listed there
        const indexEntry = indexById.get(String(recipe.id));
        if (indexEntry) indexEntry.image = result.url;

        updated++;
        console.log('✅');
      } else {
        console.log('⚠️  no match found');
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index), 'utf8');

  console.log('\n─────────────────────────────');
  console.log(`Updated: ${updated}`);
  console.log(`Already had a photo (skipped): ${skipped}`);
  console.log(`Failed / no match: ${failed}`);
  console.log('─────────────────────────────');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
