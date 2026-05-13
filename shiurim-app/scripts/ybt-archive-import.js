#!/usr/bin/env node
// =============================================================================
// ybt-archive-import.js
// Imports ~6,081 lectures from data/ybt_index.json into data/lectures.json
//
// Step 1 (once): python scripts/export-db.py
// Step 2:        node scripts/ybt-archive-import.js --test
// Step 3:        node scripts/ybt-archive-import.js
//
// Options:
//   --test        Preview mode: no file writes
//   --input PATH  Path to lectures.json  (default: data/lectures.json)
//   --json  PATH  Path to ybt_index.json (default: data/ybt_index.json)
// =============================================================================

const fs   = require('fs');
const path = require('path');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const jsonIdx   = args.indexOf('--json');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const jsonPath  = jsonIdx  !== -1 ? args[jsonIdx  + 1] : path.join('data', 'ybt_index.json');
const BACKUP_PATH = inputPath.replace('.json', '.backup-archive.json');

if (!fs.existsSync(jsonPath)) {
  console.error(`ERROR: ${jsonPath} not found.`);
  console.error('Run first:  python scripts/export-db.py');
  process.exit(1);
}

// ─── TRACTATE MAP ─────────────────────────────────────────────────────────────
const TRACTATE_MAP = {
  'brachos': 'gemarah-berachot',   'berachos': 'gemarah-berachot',
  'berachot': 'gemarah-berachot',  'brachot': 'gemarah-berachot',
  'bracot': 'gemarah-berachot',
  'shabbos': 'shabbos-gemarah',    'shabbat': 'shabbos-gemarah',
  'eruvin': 'eruvin',              'eiruvin': 'eruvin',
  'pesachim': 'pesachim',          'arvei pesachim': 'pesachim',
  'yoma': 'yomah',
  'sukka': 'sukkah-gemarah',       'sukkah': 'sukkah-gemarah',
  'rosh hashana': 'rosh-hashana-gemarah', 'rosh hashanah': 'rosh-hashana-gemarah',
  'megilla': 'gemarah-megillah',   'megillah': 'gemarah-megillah',
  'megila': 'gemarah-megillah',
  'beitza': 'gemarah-beitza',      'beitzah': 'gemarah-beitza',
  'moed katan': 'gemarah-moed-katan', 'moed kattan': 'gemarah-moed-katan',
  'chagiga': 'gemarah-chagiga',    'chagigah': 'gemarah-chagiga',
  'yevamos': 'gemarah-yevamot',    'yevamot': 'gemarah-yevamot',
  'kesubos': 'gemarah-ketuvot',    'ketuvot': 'gemarah-ketuvot',
  'kesuvos': 'gemarah-ketuvot',    'ketubot': 'gemarah-ketuvot',
  'nedarim': 'nedarim-gemarah',
  'nazir': 'gemarah-nazir',
  'gitin': 'gittin',               'gittin': 'gittin',
  'kiddushin': 'gemarah-kiddushin','kidushin': 'gemarah-kiddushin',
  'bava kamma': 'baba-kama',       'bava kama': 'baba-kama',
  'baba kama': 'baba-kama',
  'bava metzia': 'baba-metziah',   'bava metziah': 'baba-metziah',
  'bava batra': 'gemarah-bava-batra',
  'sanhedrin': 'gemarah-sanhedrin',
  'makkos': 'gemarah-makot',       'makos': 'gemarah-makot', 'makkot': 'gemarah-makot',
  'shevuos': 'gemarah-shevuot',    'shevuot': 'gemarah-shevuot',
  'avodah zarah': 'gemarah-avoda-zara', 'avoda zara': 'gemarah-avoda-zara',
  'horiyos': 'gemarah-horayot',    'horayot': 'gemarah-horayot',
  'zevachim': 'zevachim',
  'menachos': 'gemarah-menachot',  'menachot': 'gemarah-menachot',
  'chulin': 'chulin',              'chullin': 'chulin', 'hullin': 'chulin',
  'bechoros': 'gemarah-bechorot',  'bechorot': 'gemarah-bechorot',
  'erchin': 'gemarah-arachin',     'arachin': 'gemarah-arachin',
  'meilah': 'gemarah-meilah',
  'temura': 'gemarah-temura',
  'kerisus': 'gemarah-keritut',    'keritot': 'gemarah-keritut',
  'nidah': 'nidah-gemarah',        'niddah': 'nidah-gemarah',
  'sotah': 'gemarah-sotah',
  'taanis': 'gemarah-taanit',      'taanit': 'gemarah-taanit',
};

// ─── PARSHA MAP ───────────────────────────────────────────────────────────────
const PARSHA_MAP = {
  'bereishis': 'bereishit-bereishit', 'bereishit': 'bereishit-bereishit', 'bereshis': 'bereishit-bereishit',
  'noach': 'bereishit-noach',
  'lech lecha': 'bereishit-lech-lecha', 'lech-lecha': 'bereishit-lech-lecha',
  'vayeira': 'bereishit-vayeira',  'vayera': 'bereishit-vayeira',
  'chayei sara': 'bereishit-chayei-sarah', 'chayei sarah': 'bereishit-chayei-sarah',
  'chai sara': 'bereishit-chayei-sarah',
  'toldos': 'bereishit-toldot',    'toldot': 'bereishit-toldot',
  'vayeitzei': 'bereishit-vayeitzei', 'vayetzei': 'bereishit-vayeitzei', 'vayeitze': 'bereishit-vayeitzei',
  'vayishlach': 'bereishit-vayishlach',
  'vayeishev': 'bereishit-vayeshev', 'vayeshev': 'bereishit-vayeshev',
  'mikeitz': 'bereishit-miketz',   'miketz': 'bereishit-miketz',
  'vayigash': 'bereishit-vayigash',
  'vayechi': 'bereishit-vayechi',  'vaychi': 'bereishit-vayechi',
  'shemos': 'shemot-shemot',       'shemot': 'shemot-shemot',
  'vaera': 'shemot-vaeira',        "va'era": 'shemot-vaeira',
  'bo': 'shemot-bo',
  'beshalach': 'shemot-beshalach',
  'yisro': 'shemot-yitro',         'yitro': 'shemot-yitro',
  'mishpatim': 'shemot-mishpatim',
  'terumah': 'shemot-terumah',     'teruma': 'shemot-terumah',
  'tetzaveh': 'shemot-tetzaveh',   'titzaveh': 'shemot-tetzaveh',
  'ki sisa': 'shemot-ki-tisa',     'ki tisa': 'shemot-ki-tisa',
  'vayakhel': 'shemot-vayakhel',   'vayakeil': 'shemot-vayakhel',
  'pekudei': 'shemot-pekudei',     'pekudey': 'shemot-pekudei',
  'vayikra': 'vayikra-vayikra',
  'tzav': 'vayikra-tzav',
  'shemini': 'vayikra-shemini',
  'tazria': 'vayikra-tazria',
  'metzora': 'vayikra-metzora',    'metzorah': 'vayikra-metzora',
  'acharei mos': 'vayikra-acharei', 'acharei mot': 'vayikra-acharei',
  'kedoshim': 'vayikra-kedoshim',
  'emor': 'vayikra-emor',
  'behar': 'vayikra-behar',
  'bechukosai': 'vayikra-bechukotai', 'bechukotai': 'vayikra-bechukotai',
  'bamidbar': 'bamidbar-bamidbar',
  'naso': 'bamidbar-nasso',
  'behaaloscha': 'bamidbar-behaalotcha', 'behaalosecha': 'bamidbar-behaalotcha',
  'shelach': 'bamidbar-shelach',
  'korach': 'bamidbar-korach',
  'chukas': 'bamidbar-chukat',     'chukat': 'bamidbar-chukat',
  'balak': 'bamidbar-balak',
  'pinchas': 'bamidbar-pinchas',
  'matos': 'bamidbar-mattot',      'matot': 'bamidbar-mattot',
  'masei': 'bamidbar-masei',
  'devarim': 'devarim-devarim',
  'vaeschanan': 'devarim-vaetchanan', "va'eschanan": 'devarim-vaetchanan',
  'eikev': 'devarim-eikev',
  "re'eh": 'devarim-reeh',         'reeh': 'devarim-reeh',
  'shoftim': 'devarim-shoftim',
  'ki seitzei': 'devarim-ki-teitzei', 'ki seitze': 'devarim-ki-teitzei',
  'ki savo': 'devarim-ki-tavo',    'ki tavo': 'devarim-ki-tavo',
  'nitzavim': 'devarim-nitzavim',
  'vayeilech': 'devarim-vayeilech',
  'haazinu': 'devarim-haazinu',
  'vezos habracha': 'devarim-vezot-haberachah', 'vezot haberachah': 'devarim-vezot-haberachah',
};

// ─── NACH MAP ─────────────────────────────────────────────────────────────────
const NACH_MAP = {
  'mishlei': 'nach-mishlei',       'proverbs': 'nach-mishlei',
  'tehillim': 'nach-tehillim',     'psalms': 'nach-tehillim',
  'koheles': 'nach-megillot-kohelet', 'kohelet': 'nach-megillot-kohelet', 'ecclesiastes': 'nach-megillot-kohelet',
  'esther': 'nach-megillot-esther', 'megilas esther': 'nach-megillot-esther',
  'megilas ester': 'nach-megillot-esther', 'megillas esther': 'nach-megillot-esther',
  'rut': 'nach-megillot-rut',      'rus': 'nach-megillot-rut',
  'eichah': 'nach-megillot-eichah', 'eicha': 'nach-megillot-eichah',
  'yeshayahu': 'nach-yeshayahu',   'yishayahu': 'nach-yeshayahu', 'isaiah': 'nach-yeshayahu',
  'yirmiyahu': 'nach-yirmiyahu',   'jeremiah': 'nach-yirmiyahu',
  'yechezkel': 'nach-yechezkel',   'ezekiel': 'nach-yechezkel',
  'shmuel': 'nach-shmuel',         'samuel': 'nach-shmuel',
  'melachim': 'nach-melachim',     'kings': 'nach-melachim',
  'shoftim': 'nach-shoftim',       'judges': 'nach-shoftim',
  'yehoshua': 'nach-yehoshua',     'joshua': 'nach-yehoshua',
  'yonah': 'nach-yonah',           'jonah': 'nach-yonah',
};

// ─── KEYWORD RULES for Hashkafa → discussion / holidays ──────────────────────
const HASHKAFA_RULES = [
  { node: 'kisvei-rishonim-rambam-general',  phrases: ['rambam hilchos', 'rambam moreh', 'rambam peirush', 'rambam perek', 'rambam chelek', 'rambam hilcot', 'peirush hamishnayos', 'perush hamishnayos', 'sefer hamada', 'yad hachazakah', 'mishneh torah'] },
  { node: 'kisvei-rishonim-kuzari',          phrases: ['kuzari'] },
  { node: 'discussion-ikkarei-emunah',       phrases: ['ikarim', 'ikkarim', 'sefer haikarim', 'principles of faith', 'thirteen principles', 'ani maamin'] },
  { node: 'holidays-chanukah',               phrases: ['chanukah', 'chanuka', 'chanukkah', 'hanukkah', 'menorah'] },
  { node: 'holidays-pesach-general',         phrases: ['pesach', 'passover', 'haggada', 'haggadah', 'seder', 'matzah', 'matzot', 'maror', 'korban pesach', 'arba kosos'] },
  { node: 'holidays-purim',                  phrases: ['purim', 'megillas esther', 'megilas esther'] },
  { node: 'holidays-rosh-hashana-yom-kippur',phrases: ['rosh hashana', 'rosh hashanah', 'yom kippur', 'yamim noraim', 'unesane tokef', 'malchiyos', 'zichronos', 'shofros', 'kol nidre'] },
  { node: 'holidays-sukkos',                 phrases: ['sukkos', 'sukkot', 'arba minim', 'lulav', 'esrog', 'etrog', 'simchas yom tov'] },
  { node: 'holidays-shavuos',                phrases: ['shavuos', 'shavuot', 'matan torah', 'kabbalas hatorah'] },
  { node: 'holidays-tisha-bav',              phrases: ["tisha b'av", 'tisha bav', 'tishabav', 'churban', 'eicha', 'kinot'] },
  { node: 'holidays-three-weeks-general',    phrases: ['three weeks', 'bein hametzarim'] },
  { node: 'holidays-elul',                   phrases: ['elul', 'slichos', 'slichot'] },
  { node: 'holidays-sefirat-haomer',         phrases: ['sefirat haomer', 'sefira', 'sefirah', 'lag baomer', "lag b'omer"] },
  { node: 'holidays-shabbat',                phrases: ['shabbos', 'shabbat', 'shabbas'] },
  { node: 'nach-mishlei',                    phrases: ['mishlei', 'proverbs'] },
  { node: 'nach-tehillim',                   phrases: ['tehillim', 'psalms'] },
  { node: 'kisvei-chazal-all',               phrases: ['pirkei avos', 'pirkei avot', 'pirke avos', 'pirke avot'] },
  { node: 'discussion-teshuva',              phrases: ['teshuva', 'teshuvah', 'repentance', 'hilchos teshuva', 'hilchot teshuva'] },
  { node: 'discussion-tefila',               phrases: ['tefilla', 'tefillah', 'davening', 'shemonah esray', 'shemona esrei', 'amidah', 'tachanun'] },
  { node: 'discussion-emunah',               phrases: ['emunah', 'hashgacha', 'hashgachah', 'providence', 'free will', 'bechira'] },
  { node: 'discussion-olam-haba',            phrases: ['olam haba', 'afterlife', 'world to come', 'techiyas hameisim', 'resurrection', 'gehinnom'] },
  { node: 'discussion-mashiach',             phrases: ['mashiach', 'moshiach', 'messiah', 'geula', 'geulah'] },
  { node: 'discussion-beit-hamikdash',       phrases: ['beis hamikdash', 'beit hamikdash', 'mikdash', 'temple'] },
  { node: 'discussion-land-of-israel',       phrases: ['eretz yisrael', 'eretz yisroel', 'land of israel', 'zionism', 'zionizm'] },
  { node: 'discussion-science-medicine',     phrases: ['science', 'evolution', 'medicine', 'biology', 'physics', 'astronomy', 'cancer'] },
  { node: 'discussion-bein-adam-lchaveiro',  phrases: ['lashon hara', 'lashon harah', 'rechilus', 'interpersonal', 'kibbud av', 'kibud av'] },
  { node: 'discussion-middot',               phrases: ['middot', 'midos', 'anger', 'humility', 'anavah', 'gaavah', 'laziness', 'friendship', 'happiness', 'simcha'] },
  { node: 'discussion-mussar',               phrases: ['mussar', 'chovos halevavos', 'mesillas yesharim'] },
  { node: 'discussion-hashem',               phrases: ['attributes of god', 'attributes of hashem', 'tzelem elokim', 'thirteen attributes'] },
  { node: 'discussion-ahavat-yirat-hashem',  phrases: ['ahavat hashem', 'yirat hashem', 'love of god', 'fear of god', 'ahavas hashem', 'yiras hashem'] },
  { node: 'discussion-prophecy',             phrases: ['prophecy', 'nevua', 'nevuah', 'prophet'] },
  { node: 'discussion-ethics',               phrases: ['ethics', 'morality', 'moral', 'noachide', 'noachides', 'ger toshav'] },
  { node: 'discussion-reward-punishment',    phrases: ['reward and punishment', 'suffering', 'yissurin'] },
  { node: 'discussion-avraham',              phrases: ['avraham', 'abraham', 'akedah', 'akeida', 'akeidah'] },
  { node: 'discussion-relationships',        phrases: ['dating', 'marriage', 'love and happiness'] },
];

// ─── KEYWORD RULES for Halacha ────────────────────────────────────────────────
const HALACHA_RULES = [
  { node: 'holidays-pesach-general',         phrases: ['pesach', 'laws of pesach', 'passover', 'chametz', 'matzah', 'haggada'] },
  { node: 'holidays-chanukah',               phrases: ['chanukah', 'chanuka', 'ner chanuka'] },
  { node: 'holidays-purim',                  phrases: ['purim', 'megilla', 'megillah'] },
  { node: 'holidays-rosh-hashana-yom-kippur',phrases: ['rosh hashana', 'yom kippur', 'shofar'] },
  { node: 'holidays-sukkos',                 phrases: ['sukkos', 'sukkot', 'lulav', 'esrog'] },
  { node: 'holidays-shavuos',                phrases: ['shavuos', 'shavuot'] },
  { node: 'holidays-shabbat',                phrases: ['shabbos', 'shabbat', 'hilchos shabbos', 'hilchot shabbat'] },
  { node: 'halacha-shema',                   phrases: ['krias shema', 'kriat shema', 'shema yisrael'] },
  { node: 'halacha-tefillah',                phrases: ['tefilla', 'tefillah', 'davening', 'prayer'] },
  { node: 'halacha-kashrut',                 phrases: ['kashrut', 'kashrus', 'kosher', 'basar bechalav', 'treif'] },
  { node: 'halacha-brachot',                 phrases: ['brachos', 'berachos', 'berachot', 'bircas', 'birchas', 'birkat'] },
  { node: 'halacha-tfillin',                 phrases: ['tfillin', 'tefillin'] },
  { node: 'halacha-mezuzah',                 phrases: ['mezuzah', 'mezuza'] },
  { node: 'halacha-tzitzis',                 phrases: ['tzitzis', 'tzitzit'] },
  { node: 'halacha-niddah',                  phrases: ['niddah', 'nidah', 'taharat hamishpacha', 'mikveh'] },
  { node: 'halacha-teshuvah',                phrases: ['hilchos teshuva', 'hilchot teshuva'] },
  { node: 'halacha-lashon-harah',            phrases: ['lashon hara', 'lashon harah', 'rechilus'] },
  { node: 'halacha-korbanot',                phrases: ['korban', 'korbanos', 'sacrifices', 'zevach'] },
  { node: 'halacha-beit-din',                phrases: ['beis din', 'beit din', 'dina demalchusa'] },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function norm(s) {
  return (s || '').toLowerCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseTractate(title) {
  const t = norm(title);
  const sorted = Object.keys(TRACTATE_MAP).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const re = new RegExp('(^|[\\s\\-:])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|\\d|$|[\\-_/])', 'i');
    if (re.test(t)) return TRACTATE_MAP[key];
  }
  return null;
}

function parseParsha(title) {
  const t = norm(title);
  const sorted = Object.keys(PARSHA_MAP).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const re = new RegExp('(^|[\\s\\-])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$|[\\-_/,])', 'i');
    if (re.test(t)) return PARSHA_MAP[key];
  }
  return null;
}

function parseNach(title) {
  const t = norm(title);
  const sorted = Object.keys(NACH_MAP).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const re = new RegExp('(^|[\\s\\-])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|\\d|$|[\\-_/,\'])', 'i');
    if (re.test(t)) return NACH_MAP[key];
  }
  return null;
}

function applyKeywordRules(text, rules) {
  const t = norm(text);
  for (const rule of rules) {
    if (rule.phrases && rule.phrases.some(p => t.includes(norm(p)))) return rule.node;
    if (rule.all && rule.all.length > 0 && rule.all.every(p => t.includes(norm(p)))) return rule.node;
  }
  return null;
}

function inferCategoryFromUrl(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('/gemara/') || u.includes('/gemarah/'))         return 'Gemara';
  if (u.includes('/hashkafa/') || u.includes('/hashkafah/'))     return 'Hashkafa';
  if (u.includes('/halacha/') || u.includes('/halachah/'))       return 'Halacha';
  if (u.includes('/chumash/') || u.includes('/parsha/'))         return 'Chumash';
  if (u.includes('/nach/') || u.includes('/tanach/') || u.includes('/navi/')) return 'Tanach';
  if (u.includes('/mishlei/'))  return 'Nach-Mishlei';
  if (u.includes('/tehillim/')) return 'Nach-Tehillim';
  return null;
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
function resolveTarget(row) {
  const { url, title, section, category } = row;
  const searchText = `${title} ${section}`;

  let cat = (category || '').trim();
  if (!cat) cat = inferCategoryFromUrl(url) || '';
  const catLow = cat.toLowerCase();

  if (catLow === 'gemara') {
    return parseTractate(title) || parseTractate(section) || 'gemarah-archived';
  }

  if (catLow === 'chumash' || catLow === 'chumash/nach') {
    return parseParsha(title) || parseParsha(section) || parseNach(title) || 'chumash-archived';
  }

  if (['tanach', 'navi', 'nach-mishlei', 'nach-tehillim'].includes(catLow) || catLow === 'navi') {
    return parseNach(title) || parseNach(section) || 'nach-archived';
  }

  if (catLow === 'hashkafa') {
    const titleLow = norm(title);
    if (/^rambam\b/.test(titleLow))                              return 'kisvei-rishonim-rambam-general';
    if (/^kuzari\b/.test(titleLow))                              return 'kisvei-rishonim-kuzari';
    if (/^pirkei avos|^pirke avos|^pirkei avot/.test(titleLow)) return 'kisvei-chazal-all';
    if (/^mishlei\b/.test(titleLow))                             return 'nach-mishlei';
    if (/^tehillim\b|^psalms\b/.test(titleLow))                  return 'nach-tehillim';
    const nach = parseNach(section);
    if (nach) return nach;
    const parsha = parseParsha(title) || parseParsha(section);
    if (parsha) return parsha;
    return applyKeywordRules(searchText, HASHKAFA_RULES) || 'discussion-archived';
  }

  if (catLow === 'halacha') {
    return applyKeywordRules(searchText, HALACHA_RULES) || 'halacha-archived';
  }

  return 'misc-archived';
}

// ─── TREE HELPERS ─────────────────────────────────────────────────────────────
function findNode(categories, id) {
  for (const node of categories) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function ensureNode(categories, { id, label, parentId, type }) {
  if (findNode(categories, id)) return;
  if (parentId === null) {
    categories.push(type === 'folder'
      ? { id, label, icon: '📼', children: [] }
      : { id, label, icon: '📼', lectures: [] });
    return;
  }
  const parent = findNode(categories, parentId);
  if (!parent) { console.warn(`  [WARN] Parent not found: ${parentId} for ${id}`); return; }
  const n = type === 'folder' ? { id, label, children: [] } : { id, label, lectures: [] };
  if (Array.isArray(parent.children)) parent.children.push(n);
  else parent.children = [n];
  console.log(`  [NEW] ${id} → ${parentId}`);
}

function buildExistingIds(categories) {
  const ids = new Set();
  function walk(nodes) {
    for (const n of nodes) {
      if (n.lectures) n.lectures.forEach(l => ids.add(l.id));
      if (n.children) walk(n.children);
    }
  }
  walk(categories);
  return ids;
}

// ─── NEW NODES ────────────────────────────────────────────────────────────────
const NEW_NODES = [
  { id: 'gemarah-archived',    label: '2002–2014', parentId: 'gemarah',    type: 'lectures' },
  { id: 'discussion-archived', label: '2002–2014', parentId: 'discussion', type: 'lectures' },
  { id: 'halacha-archived',    label: '2002–2014', parentId: 'halacha',    type: 'lectures' },
  { id: 'chumash-archived',    label: '2002–2014', parentId: 'chumash',    type: 'lectures' },
  { id: 'nach-archived',       label: '2002–2014', parentId: 'nach',       type: 'lectures' },
  { id: 'misc-archived',       label: '2002–2014', parentId: 'misc',       type: 'lectures' },
  { id: 'holidays-archived',   label: '2002–2014', parentId: 'holidays',   type: 'lectures' },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
  console.log(`\n========================================`);
  console.log(isTest ? '  YBT Archive Import — TEST MODE' : '  YBT Archive Import — FULL MODE');
  console.log(`  JSON:  ${jsonPath}`);
  console.log(`  Input: ${inputPath}`);
  console.log(`========================================\n`);

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: ${inputPath} not found. Run from project root.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { categories } = data;

  if (!isTest) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2));
    console.log(`Backed up to ${BACKUP_PATH}\n`);
    console.log('Creating new nodes...');
    for (const nodeDef of NEW_NODES) ensureNode(categories, nodeDef);
    console.log('Node creation complete.\n');
  }

  const existingIds = buildExistingIds(categories);
  console.log(`Existing lecture IDs: ${existingIds.size}\n`);

  // Load rows from JSON (exported by export-db.py)
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Rows in export: ${rows.length}\n`);

  let added = 0, skipped = 0, unmapped = 0;
  const routingStats = {};
  const testSamples = [];

  for (const row of rows) {
    const id = `YBTArchived-${row.rowid}`;
    if (existingIds.has(id)) { skipped++; continue; }

    const targetId = resolveTarget(row);
    routingStats[targetId] = (routingStats[targetId] || 0) + 1;

    if (isTest) {
      if (testSamples.length < 10) {
        testSamples.push({
          id,
          title:    row.title,
          rabbi:    row.rabbi,
          category: row.category || `(blank→${inferCategoryFromUrl(row.url) || 'unknown'})`,
          section:  (row.section || '').substring(0, 50).trim(),
          targetId,
          audioUrl: row.url,
        });
      }
      continue;
    }

    const targetNode = findNode(categories, targetId);
    if (!targetNode || !Array.isArray(targetNode.lectures)) { unmapped++; continue; }

    targetNode.lectures.push({
      id,
      title:       (row.title || row.anchor_text || '').trim(),
      audioUrl:    row.url || '',
      duration:    0,
      description: '',
      speaker:     (row.rabbi || '').trim(),
      date:        (row.date_iso || '').substring(0, 10),
      tags:        [row.category, row.section].filter(Boolean).map(s => s.trim()).filter(Boolean),
      sourceId:    row.rowid,
    });
    existingIds.add(id);
    added++;
  }

  if (isTest) {
    console.log('════════════════════════════════════════');
    console.log('TEST RESULTS — sample routing:');
    console.log('════════════════════════════════════════\n');
    for (const s of testSamples) {
      console.log(`ID:       ${s.id}`);
      console.log(`Title:    ${s.title}`);
      console.log(`Rabbi:    ${s.rabbi}`);
      console.log(`Category: ${s.category}  |  Section: ${s.section}`);
      console.log(`→ Node:   ${s.targetId}`);
      console.log(`Audio:    ${s.audioUrl}`);
      console.log('────────────────────────────────────────');
    }
    console.log('\nFull routing preview:');
    for (const [node, count] of Object.entries(routingStats).sort((a,b) => b[1]-a[1])) {
      console.log(`  ${node.includes('archived') ? '⚠ ' : '✓ '} ${node}: ${count}`);
    }
    return;
  }

  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

  console.log('════════════════════════════════════════');
  console.log('DONE');
  console.log(`  Total rows:  ${rows.length}`);
  console.log(`  Added:       ${added}`);
  console.log(`  Skipped dup: ${skipped}`);
  console.log(`  Unmapped:    ${unmapped}`);
  console.log('\n  Routing breakdown:');
  for (const [node, count] of Object.entries(routingStats).sort((a,b) => b[1]-a[1])) {
    console.log(`    ${node.includes('archived') ? '⚠ ' : '✓ '} ${node}: ${count}`);
  }
  console.log(`\n  Saved to: ${inputPath}`);
  console.log('════════════════════════════════════════\n');
}

main();
