// Flat curated word pool. Bucketed by actual length below so length counts
// are always correct, no matter how this list is edited.
const WORDS = [
  // 3
  'cat', 'dog', 'sun', 'run', 'red', 'sky', 'ice', 'egg', 'fox', 'box',
  'key', 'map', 'bat', 'net', 'jam', 'wig', 'rat', 'owl', 'elk', 'axe',
  'bee', 'cow', 'ant', 'ram', 'jaw', 'fin', 'orb', 'imp',
  // 4
  'jump', 'fire', 'wolf', 'moon', 'iron', 'frog', 'king', 'lava', 'wind', 'gold',
  'tree', 'wave', 'rock', 'bark', 'dust', 'fang', 'claw', 'pike', 'gnaw', 'howl',
  'bone', 'crow', 'toad', 'worm', 'moss', 'pelt', 'gore', 'mud', 'lime', 'sand',
  // 5
  'shard', 'grave', 'ghoul', 'crypt', 'blood', 'venom', 'stalk', 'prowl', 'growl', 'ashes',
  'flare', 'spike', 'brute', 'creep', 'lurch', 'flesh', 'decay', 'toxin', 'thorn', 'briar',
  'storm', 'flame', 'chain', 'sneer', 'gnash', 'snarl', 'ember', 'crawl',
  // 6
  'zombie', 'undead', 'shriek', 'wither', 'stumble', 'shamble', 'ghastly', 'menace', 'horror', 'plague',
  'sickle', 'rotten', 'grisly', 'grimly', 'mangle', 'shovel', 'bunker', 'debris', 'rubble', 'scythe',
  'hollow', 'shadow', 'thrash', 'gnarly', 'skitter',
  // 7
  'infected', 'shamble', 'crumble', 'wretched', 'putrid', 'ghastlier', 'crawling', 'lurking',
  'moaning', 'rasping', 'grisliest', 'clawing', 'stagger', 'stumped', 'ragged', 'twisted',
  'buried', 'cursed', 'gnarled', 'mangled', 'gnashing', 'howling', 'gnawing', 'crooked',
  // 8
  'zombified', 'outbreak', 'graveyard', 'infested', 'writhing', 'staggered', 'shredded',
  'shambling', 'wretched', 'quarantine', 'biohazard', 'contagion', 'gangrene', 'putrefy',
  'skeletal', 'deathless', 'grisliest', 'shrieking', 'moldering', 'festering',
  // 9
  'apocalypse', 'infestation', 'quarantine', 'putrefying', 'decomposed', 'devastated',
  'ravenously', 'staggering', 'shambolic', 'gruesomely', 'overrun', 'necrosis',
  // 10
  'apocalyptic', 'devastation', 'putrescence', 'reanimated', 'decomposing', 'bloodcurdle',
  'necromancer', 'catastrophe', 'annihilated', 'outnumbered',
];

const BY_LENGTH = new Map();
for (const word of WORDS) {
  const len = word.length;
  if (!BY_LENGTH.has(len)) BY_LENGTH.set(len, []);
  BY_LENGTH.get(len).push(word);
}

function candidatesInRange(minLen, maxLen) {
  const out = [];
  for (let len = minLen; len <= maxLen; len++) {
    const bucket = BY_LENGTH.get(len);
    if (bucket) out.push(...bucket);
  }
  return out;
}

/**
 * Pick a word within [minLen, maxLen] not present in usedWords.
 * Falls back to the full pool if the requested range is exhausted,
 * so spawning never stalls even under heavy zombie counts.
 */
export function pickWord(minLen, maxLen, usedWords) {
  let pool = candidatesInRange(minLen, maxLen).filter(w => !usedWords.has(w));
  if (pool.length === 0) pool = WORDS.filter(w => !usedWords.has(w));
  if (pool.length === 0) pool = WORDS; // pathological: every word alive at once
  return pool[Math.floor(Math.random() * pool.length)];
}
