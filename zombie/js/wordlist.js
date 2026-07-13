// Flat curated word pool. Bucketed by actual length below so length counts
// are always correct, no matter how this list is edited. Nothing here should
// exceed 10 letters - the config panel's word-length slider caps at 10, and
// tank zombies draw only from the 9-10 range, so anything longer is dead
// weight that can never actually be selected.
const WORDS = [
  // 3
  'cat', 'dog', 'sun', 'run', 'red', 'sky', 'ice', 'egg', 'fox', 'box',
  'key', 'map', 'bat', 'net', 'jam', 'wig', 'rat', 'owl', 'elk', 'axe',
  'bee', 'cow', 'ant', 'ram', 'jaw', 'fin', 'orb', 'imp', 'bug', 'rot',
  'gut', 'jar', 'pit', 'web', 'fur', 'paw', 'jug', 'hex', 'urn', 'oak',
  'elm', 'sap', 'tar', 'ash', 'ivy', 'jet', 'log', 'mob', 'nun', 'oil',
  'pod', 'rib', 'rug', 'tan', 'van', 'wax', 'yak', 'keg', 'lab', 'mop',
  'pen', 'pig', 'rag', 'sob', 'tub', 'vat', 'wag', 'zap', 'hut', 'cop',
  'den', 'fee', 'gap', 'hop', 'ink', 'jab', 'kit', 'lug', 'nag', 'peg',
  // 4
  'jump', 'fire', 'wolf', 'moon', 'iron', 'frog', 'king', 'lava', 'wind', 'gold',
  'tree', 'wave', 'rock', 'bark', 'dust', 'fang', 'claw', 'pike', 'gnaw', 'howl',
  'bone', 'crow', 'toad', 'worm', 'moss', 'pelt', 'gore', 'lime', 'sand', 'bite',
  'fume', 'gash', 'grim', 'gunk', 'hiss', 'hunt', 'jinx', 'limb', 'loot', 'maze',
  'moan', 'murk', 'ooze', 'pale', 'pray', 'prey', 'pyre', 'reek', 'ruin', 'rust',
  'scab', 'scar', 'seep', 'sift', 'skin', 'slay', 'slug', 'slum', 'snap', 'sore',
  'spit', 'stab', 'stew', 'tomb', 'vile', 'welt', 'wisp', 'wrap', 'yell', 'zone',
  'char', 'clot', 'coal', 'cove', 'dank', 'dent', 'doom', 'drip', 'dune', 'edge',
  'flea', 'flee', 'foul', 'gasp', 'gaze', 'glow', 'grip', 'grub', 'hive', 'jaws',
  // 5
  'shard', 'grave', 'ghoul', 'crypt', 'blood', 'venom', 'stalk', 'prowl', 'growl', 'ashes',
  'flare', 'spike', 'brute', 'creep', 'lurch', 'flesh', 'decay', 'toxin', 'thorn', 'briar',
  'storm', 'flame', 'chain', 'sneer', 'gnash', 'snarl', 'ember', 'crawl', 'haunt', 'groan',
  'wound', 'feast', 'spawn', 'twist', 'snare', 'quake', 'fever', 'chill', 'dread', 'panic',
  'plead', 'weary', 'drain', 'mourn', 'stark', 'gloom', 'brink', 'siege', 'grasp', 'seize',
  'choke', 'waste', 'might', 'sight', 'fight', 'flint', 'crisp', 'crust', 'burnt', 'grime',
  'slime', 'stink', 'clump', 'crash', 'crush', 'flash', 'flush', 'shrub', 'skull', 'spasm',
  'spore', 'swarm', 'swamp', 'wrath', 'brood', 'clank', 'clang', 'oozed',
  // 6
  'zombie', 'undead', 'shriek', 'wither', 'menace', 'horror', 'plague', 'sickle', 'rotten', 'grisly',
  'grimly', 'mangle', 'shovel', 'bunker', 'debris', 'rubble', 'scythe', 'hollow', 'shadow', 'thrash',
  'gnarly', 'writhe', 'corpse', 'casket', 'sludge', 'sicken', 'undone', 'bloody', 'rancid', 'morbid',
  'septic', 'tremor', 'shiver', 'stormy', 'craven', 'feeble', 'warped', 'hunger', 'plunge', 'ravage',
  'tangle', 'sinewy', 'sickly', 'grubby', 'grungy', 'matted', 'broken', 'sunken', 'rotted', 'gutted',
  'ragged', 'putrid', 'buried', 'cursed', 'mucous', 'oozing', 'clawed', 'gouged', 'maimed', 'seeped',
  'wretch', 'trench',
  // 7
  'lurking', 'moaning', 'rasping', 'clawing', 'stagger', 'stumped', 'twisted', 'gnarled', 'mangled', 'howling',
  'gnawing', 'crooked', 'stumble', 'ghastly', 'shudder', 'creaked', 'reeking', 'seeping', 'shrieks', 'snarled',
  'trapped', 'weeping', 'rotting', 'decayed', 'tainted', 'clotted', 'gouging', 'shamble', 'gasping', 'hissing',
  'choking', 'hunting', 'rattled', 'shackle', 'swarmed', 'crushed', 'flushed', 'clasped', 'clamped', 'grasped',
  'gnashed', 'overrun', 'putrefy',
  // 8
  'outbreak', 'infested', 'writhing', 'shredded', 'gangrene', 'skeletal', 'staggers', 'clutches', 'gruesome', 'wretches',
  'starving', 'clambers', 'convulse', 'trembles', 'devoured', 'poisoned', 'venomous', 'deadened', 'groaning', 'clenched',
  'throttle', 'necrosis',
  // 9
  'zombified', 'graveyard', 'staggered', 'shambling', 'biohazard', 'contagion', 'deathless', 'grisliest', 'shrieking', 'moldering',
  'festering', 'crumbling', 'shambolic', 'chokehold', 'bloodbath', 'cataclysm', 'devouring', 'nightmare', 'grotesque', 'parasitic',
  'malicious', 'infection', 'nocturnal', 'harrowing',
  // 10
  'quarantine', 'chittering', 'apocalypse', 'reanimated', 'disembowel', 'deadweight', 'skinwalker', 'contagious', 'putrescent', 'devastated',
  'decomposed', 'ravenously', 'staggering', 'gruesomely', 'infectious', 'foreboding', 'cadaverous',
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
