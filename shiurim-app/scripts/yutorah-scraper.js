#!/usr/bin/env node
// =============================================================================
// yutorah-scraper.js
// Fetches all YBT shiurim from the YUTorah API (org 367) and merges them
// into data/lectures.json using the agreed category mapping.
//
// Usage (run from project root):
//   node scripts/yutorah-scraper.js --test        # fetch page 1, preview routing for 5 lectures
//   node scripts/yutorah-scraper.js --pages 3     # scrape first 3 pages only
//   node scripts/yutorah-scraper.js               # full scrape (~400 pages)
//
// Options:
//   --test          Preview mode: no file writes, shows routing + audio URLs for 5 lectures
//   --pages N       Only process first N pages
//   --input PATH    Path to lectures.json (default: data/lectures.json)
//   --delay MS      Delay between API pages in ms (default: 400)
// =============================================================================

const fs   = require('fs');
const path = require('path');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const isTest     = args.includes('--test');
const pagesIdx   = args.indexOf('--pages');
const maxPages   = pagesIdx !== -1 ? parseInt(args[pagesIdx + 1]) : (isTest ? 1 : Infinity);
const inputIdx   = args.indexOf('--input');
const inputPath  = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const delayIdx   = args.indexOf('--delay');
const DELAY_MS   = delayIdx !== -1 ? parseInt(args[delayIdx + 1]) : 400;

const BACKUP_PATH = inputPath.replace('.json', '.backup.json');
const ORG_ID      = 367;
const PAGE_SIZE   = 30;
const API_BASE    = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const DATE_CAP    = '2030-01-01T00:00:00Z';

// ─── CATEGORY MAP ─────────────────────────────────────────────────────────────
// Key: "YUTorah Category|Subcategory"   Value: target node ID in lectures.json
// Special values: __AVOT__ (teacher-split logic), __SKIP__ (unmapped/ignored)
const CATEGORY_MAP = {
  // GEMARA
  'Gemara|Aggadeta':            'gemarah-aggadeta',
  'Gemara|Arachin':             'gemarah-arachin',
  'Gemara|Avoda Zara':          'gemarah-avoda-zara',
  'Gemara|Bava Batra':          'gemarah-bava-batra',
  'Gemara|Bava Kamma':          'baba-kama',
  'Gemara|Bava Metzia':         'baba-metziah',
  'Gemara|Bechorot':            'gemarah-bechorot',
  'Gemara|Beitza':              'gemarah-beitza',
  'Gemara|Berachot':            'gemarah-berachot',
  'Gemara|Chagiga':             'gemarah-chagiga',
  'Gemara|Chullin':             'chulin',
  'Gemara|Eruvin':              'eruvin',
  'Gemara|General':             'other-gemarah',
  'Gemara|Gittin':              'gittin',
  'Gemara|Horayot':             'gemarah-horayot',
  'Gemara|Keritut':             'gemarah-keritut',
  'Gemara|Ketuvot':             'gemarah-ketuvot',
  'Gemara|Kiddushin':           'gemarah-kiddushin',
  'Gemara|Makot':               'gemarah-makot',
  'Gemara|Megillah':            'gemarah-megillah',
  'Gemara|Meilah':              'gemarah-meilah',
  'Gemara|Menachot':            'gemarah-menachot',
  'Gemara|Moed Katan':          'gemarah-moed-katan',
  'Gemara|Nazir':               'gemarah-nazir',
  'Gemara|Nedarim':             'nedarim-gemarah',
  'Gemara|Nidah':               'nidah-gemarah',
  'Gemara|Pesachim':            'pesachim',
  'Gemara|Rosh Hashana':        'rosh-hashana-gemarah',
  'Gemara|Sanhedrin':           'gemarah-sanhedrin',
  'Gemara|Shabbat':             'shabbos-gemarah',
  'Gemara|Shevuot':             'gemarah-shevuot',
  'Gemara|Sotah':               'gemarah-sotah',
  'Gemara|Sukkah':              'sukkah-gemarah',
  'Gemara|Taanit':              'gemarah-taanit',
  'Gemara|Temura':              'gemarah-temura',
  'Gemara|Yevamot':             'gemarah-yevamot',
  'Gemara|Yoma':                'yomah',
  'Gemara|Zevachim':            'zevachim',

  // YERUSHALMI
  'Yerushalmi|Bava Metzia':     'gemarah-yerushalmi-bava-metzia',
  'Yerushalmi|Berachos':        'gemarah-yerushalmi-berachot',
  'Yerushalmi|Berachot':        'gemarah-yerushalmi-berachot',
  'Yerushalmi|Shabbos':         'gemarah-yerushalmi-shabbat',
  'Yerushalmi|Shabbat':         'gemarah-yerushalmi-shabbat',

  // HALACHA
  'Halacha|Adar II':                        'halacha-adar-ii',
  "Halacha|Assara B'Tevet":                 'halacha-assara-btevet',
  'Halacha|Aveilut':                        'halacha-aveilut',
  'Halacha|Avodah Zarah':                   'halacha-avodah-zarah',
  'Halacha|Basar Bechalav':                 'halacha-basar-bechalav',
  'Halacha|Bechorot':                       'halacha-bechorot',
  "Halacha|Bein Adam l'Chaveiro":           'halacha-bein-adam-lchaveiro',
  'Halacha|Beit Din':                       'halacha-beit-din',
  'Halacha|Beit Hamikdash':                 'halacha-beit-hamikdash',
  'Halacha|Birchas Kohanim':                'halacha-birchas-kohanim',
  'Halacha|Birchot HaTorah':                'halacha-birchot-hatorah',
  'Halacha|Birkat Hamazon':                 'halacha-birkat-hamazon',
  'Halacha|Bishul':                         'halacha-bishul',
  'Halacha|Bnei Noach':                     'halacha-bnei-noach',
  'Halacha|Brachot':                        'halacha-brachot',
  'Halacha|Brit Milah':                     'halacha-brit-milah',
  'Halacha|Business':                       'halacha-business',
  'Halacha|Challah':                        'halacha-challah',
  'Halacha|Chanukah':                       'halacha-chanukah',
  'Halacha|Chatzi Shiur':                   'halacha-chatzi-shiur',
  'Halacha|Children':                       'halacha-children',
  'Halacha|Chinuch':                        'halacha-chinuch',
  'Halacha|Chodosh':                        'halacha-chodosh',
  'Halacha|Chol Hamoed':                    'halacha-chol-hamoed',
  'Halacha|Choshen Mishpat':                'halacha-choshen-mishpat',
  'Halacha|Death and Burial':               'halacha-death-burial',
  'Halacha|Elul':                           'halacha-elul',
  'Halacha|Eruvin':                         'halacha-eruvin',
  'Halacha|Eved Ivri':                      'halacha-eved-ivri',
  'Halacha|Even Haezer':                    'halacha-even-haezer',
  'Halacha|Family & Ishut':                 'halacha-family-ishut',
  'Halacha|Geirut':                         'halacha-geirut',
  'Halacha|General':                        'halacha-general',
  'Halacha|Gittin':                         'halacha-gittin',
  'Halacha|Hachnasat Orchim':               'halacha-hachnasat-orchim',
  'Halacha|Hechsher Keilim':               'halacha-hechsher-keilim',
  'Halacha|Hilkhot Seudah':                 'halacha-hilkhot-seudah',
  'Halacha|Israel':                         'halacha-israel',
  'Halacha|Kashrut':                        'halacha-kashrut',
  "Halacha|Kibud Av v'Aim":                'halacha-kibud-av-vaim',
  'Halacha|Kiddush Hashem':                 'halacha-kiddush-hashem',
  'Halacha|Kiddush and Havdala':            'halacha-kiddush-havdala',
  'Halacha|Kiddushin':                      'halacha-kiddushin',
  'Halacha|Kohanim':                        'halacha-kohanim',
  'Halacha|Korbanot':                       'halacha-korbanot',
  'Halacha|Lashon Harah':                   'halacha-lashon-harah',
  'Halacha|Lifnei Iver':                    'halacha-lifnei-iver',
  'Halacha|Lo Tasur':                       'halacha-lo-tasur',
  "Halacha|Ma'aser":                        'halacha-maaser',
  'Halacha|Marit Ayin':                     'halacha-marit-ayin',
  'Halacha|Medical Ethics':                 'halacha-medical-ethics',
  'Halacha|Medicine':                       'halacha-medicine',
  'Halacha|Mezuzah':                        'halacha-mezuzah',
  'Halacha|Mikvaot':                        'halacha-mikvaot',
  'Halacha|Minhagim':                       'halacha-minhagim',
  'Halacha|Mishkan':                        'halacha-mishkan',
  'Halacha|Muktza':                         'halacha-muktza',
  'Halacha|Netilat Yadayim':                'halacha-netilat-yadayim',
  'Halacha|Nezikin':                        'halacha-nezikin',
  'Halacha|Niddah':                         'halacha-niddah',
  'Halacha|Orach Chaim':                    'halacha-orach-chaim',
  'Halacha|Pat Akum':                       'halacha-pat-akum',
  'Halacha|Pesach':                         'halacha-pesach',
  'Halacha|Purim':                          'halacha-purim',
  'Halacha|Rabbinic Laws':                  'halacha-rabbinic-laws',
  'Halacha|Rosh Hashana':                   'halacha-rosh-hashana',
  'Halacha|Rules of Psak':                  'halacha-rules-of-psak',
  'Halacha|Science & Medicine':             'halacha-science-medicine',
  'Halacha|Sefirat HaOmer':                 'halacha-sefirat-haomer',
  'Halacha|Shaatnez':                       'halacha-shaatnez',
  'Halacha|Shabbat':                        'halacha-shabbat',
  'Halacha|Shavuot':                        'halacha-shavuot',
  'Halacha|Shechitah':                      'halacha-shechitah',
  'Halacha|Sheimos':                        'halacha-sheimos',
  'Halacha|Shema':                          'halacha-shema',
  'Halacha|Shemittah':                      'halacha-shemittah',
  'Halacha|Sheva Brachot':                  'halacha-sheva-brachot',
  "Halacha|Sheva Mitzvot B'nei Noach":     'halacha-sheva-mitzvot-bnei-noach',
  'Halacha|Shiluach Haken':                 'halacha-shiluach-haken',
  'Halacha|Shofar':                         'halacha-shofar',
  'Halacha|Shtarot':                        'halacha-shtarot',
  'Halacha|Shvuot and Nedarim':             'halacha-shvuot-nedarim',
  'Halacha|Sukkot':                         'halacha-sukkot',
  'Halacha|Taarovos':                       'halacha-taarovos',
  'Halacha|Taharos':                        'halacha-taharos',
  'Halacha|Talmud':                         'halacha-talmud',
  'Halacha|Tefillah':                       'halacha-tefillah',
  'Halacha|Teshuvah':                       'halacha-teshuvah',
  'Halacha|Tevilat Kaylim':                 'halacha-tevilat-kaylim',
  'Halacha|Tfillin':                        'halacha-tfillin',
  'Halacha|Torah':                          'halacha-torah',
  'Halacha|Tzedakah':                       'halacha-tzedakah',
  'Halacha|Tzitzis':                        'halacha-tzitzis',
  'Halacha|Tzniut':                         'halacha-tzniut',
  'Halacha|War':                            'halacha-war',
  'Halacha|Weddings':                       'halacha-weddings',
  'Halacha|Women':                          'halacha-women',
  'Halacha|Yichud':                         'halacha-yichud',
  'Halacha|Yom Kippur':                     'halacha-yom-kippur',
  'Halacha|Yom Tov':                        'halacha-yom-tov',
  'Halacha|Yoreh Deah':                     'halacha-yoreh-deah',

  // HISTORY
  'History|21st Century CE':           'discussion-history-21st-century',
  'History|Bayit Sheni':               'discussion-history-bayit-sheni',
  'History|Period of Tanach':          'discussion-history-period-of-tanach',

  // MACHSHAVA
  'Machshava|Adar II':                  'holidays-adar',
  'Machshava|Ahavat Hashem':            'discussion-ahavat-yirat-hashem',
  'Machshava|Akeidas Yitzchak':         'discussion-akeidah',
  'Machshava|Angels':                   'discussion-angels',
  "Machshava|Assara B'Tevet":           'holidays-fast-assara-btevet',
  'Machshava|Avraham':                  'discussion-avraham',
  "Machshava|Bein Adam L'Chaveiro":     'discussion-bein-adam-lchaveiro',
  'Machshava|Beit HaMikdash':           'discussion-beit-hamikdash',
  'Machshava|Bitachon':                 'discussion-bitachon',
  'Machshava|Chanukah':                 'holidays-chanukah',
  'Machshava|Chinuch':                  'discussion-chinuch',
  'Machshava|Chol Hamoed':              'holidays-chol-hamoed',
  'Machshava|Derech Hashem':            'discussion-derech-hashem',
  'Machshava|Derekh haLimud':           'discussion-learning-chachma',
  'Machshava|Dvekus':                   'discussion-dvekus',
  'Machshava|Elul':                     'holidays-elul',
  'Machshava|Emunah':                   'discussion-emunah',
  'Machshava|Ethics':                   'discussion-ethics',
  'Machshava|Exploring Judaism':        'discussion-exploring-judaism',
  'Machshava|Family & Ishut':           'discussion-family-ishut',
  'Machshava|General':                  'discussion-general',
  'Machshava|Geulah':                   'discussion-geulah',
  'Machshava|Hashem':                   'discussion-hashem',
  'Machshava|Hebrew':                   'misc-general',
  'Machshava|History':                  'discussion-history-general',
  'Machshava|Ikkarei Emunah':           'discussion-ikkarei-emunah',
  'Machshava|Israel':                   'discussion-land-of-israel',
  'Machshava|Kabbalah':                 'discussion-kabalah',
  'Machshava|Kiruv':                    'discussion-kiruv',
  'Machshava|Kuzari':                   'kisvei-rishonim-kuzari',
  'Machshava|Lag BaOmer':               'holidays-lag-baomer',
  'Machshava|Leadership':               'discussion-leadership',
  'Machshava|Marriage':                 'discussion-relationships',
  'Machshava|Mashiach':                 'discussion-mashiach',
  'Machshava|Mesorah':                  'discussion-torah-shebaal-peh',
  'Machshava|Middot':                   'discussion-middot',
  'Machshava|Midrash':                  'discussion-midrash-general',
  'Machshava|Mitzvot':                  'discussion-mitzvot',
  'Machshava|Modern Orthodoxy':         'discussion-modern-orthodoxy',
  'Machshava|Mussar':                   'discussion-mussar',
  'Machshava|Olam Habah':               'discussion-olam-haba',
  'Machshava|Pesach':                   'holidays-pesach-general',
  'Machshava|Philosophy of Halacha':    'discussion-philosophy-halacha',
  'Machshava|Pluralism':                'discussion-pluralism',
  'Machshava|Politics':                 'discussion-politics',
  'Machshava|Prophecy':                 'discussion-prophecy',
  'Machshava|Purim':                    'holidays-purim-purim',
  'Machshava|Rabbinic Authority':       'discussion-rabbinic-authority',
  'Machshava|Rambam':                   'kisvei-rishonim-rambam-general',
  'Machshava|Ramban':                   'kisvei-rishonim-ramban',
  'Machshava|Relationships':            'discussion-relationships',
  'Machshava|Revelation':               'discussion-revelation',
  'Machshava|Reward and Punishment':    'discussion-reward-punishment',
  'Machshava|Rosh Hashana':             'holidays-rosh-hashana-yom-kippur',
  'Machshava|Science & Medicine':       'discussion-science-medicine',
  'Machshava|Sefirat HaOmer':           'holidays-sefirat-haomer',
  'Machshava|Shabbat':                  'holidays-shabbat',
  'Machshava|Shavuot':                  'holidays-shavuos',
  'Machshava|Shemittah':                'discussion-shemittah',
  'Machshava|Simcha/Happiness':         'discussion-simcha',
  'Machshava|Sukkot':                   'holidays-sukkos',
  'Machshava|Supernatural':             'discussion-supernatural',
  'Machshava|Tanya':                    'discussion-tanya',
  'Machshava|Tefillah':                 'discussion-tefila',
  'Machshava|Teshuva':                  'discussion-teshuva',
  'Machshava|The Avos':                 'discussion-the-avos',
  'Machshava|Three Weeks':              'holidays-three-weeks-general',
  'Machshava|Torah':                    'discussion-learning-chachma',
  "Machshava|Torah She-Ba'al Peh":     'discussion-torah-shebaal-peh',
  "Machshava|Torah U'Madda":            'discussion-torah-umadda',
  'Machshava|Tzom Gedalia':             'holidays-fast-tzom-gedalia',
  'Machshava|Women':                    'discussion-women',
  'Machshava|Yamim Noraim':             'holidays-rosh-hashana-yom-kippur',
  'Machshava|Yirat Hashem':             'discussion-ahavat-yirat-hashem',
  'Machshava|Yom Kippur':               'holidays-rosh-hashana-yom-kippur',
  'Machshava|Yom Tov':                  'holidays-yom-tov',
  'Machshava|Zionism':                  'discussion-zionism',

  // MIDRASH
  'Midrash|Midrash Rabbah - Torah':    'discussion-midrash-rabbah-torah',
  'Midrash|Midrash Tanchuma':          'discussion-midrash-tanchuma',

  // MISHNA (Avot handled separately via __AVOT__)
  'Mishna|Avot':        '__AVOT__',
  'Mishna|Bava Batra':  'mishna-bava-batra',
  'Mishna|Bava Kamma':  'mishna-bava-kamma',
  'Mishna|Bava Metzia': 'mishna-bava-metzia',
  'Mishna|Bechorot':    'mishna-bechorot',
  'Mishna|Bikkurim':    'mishna-bikkurim',
  'Mishna|Brachot':     'mishna-brachot',
  'Mishna|Challah':     'mishna-challah',
  'Mishna|General':     'mishna-general',
  'Mishna|Gittin':      'mishna-gittin',
  'Mishna|Keilim':      'mishna-keilim',
  'Mishna|Ketuvot':     'mishna-ketuvot',
  'Mishna|Kilayim':     'mishna-kilayim',
  'Mishna|Makkot':      'mishna-makkot',
  'Mishna|Megillah':    'mishna-megillah',
  'Mishna|Menachot':    'mishna-menachot',
  'Mishna|Mikvaot':     'mishna-mikvaot',
  'Mishna|Moed Kattan': 'mishna-moed-kattan',
  'Mishna|Negaim':      'mishna-negaim',
  'Mishna|Pesachim':    'mishna-pesachim',
  'Mishna|Shabbat':     'mishna-shabbat',
  'Mishna|Sukkah':      'mishna-sukkah',

  // MOADIM U'ZMANIM
  "Moadim U'Zmanim/Holidays|Adar":                'holidays-adar',
  "Moadim U'Zmanim/Holidays|Aseret Y'mei Teshuvah": 'holidays-rosh-hashana-yom-kippur',
  "Moadim U'Zmanim/Holidays|Kislev":              'holidays-chanukah',
  "Moadim U'Zmanim/Holidays|Pesach Sheni":         'holidays-pesach-pesach-sheni',
  "Moadim U'Zmanim/Holidays|Rosh Chodesh":         'holidays-rosh-chodesh',
  "Moadim U'Zmanim/Holidays|Shabbos":              'holidays-shabbat',
  "Moadim U'Zmanim/Holidays|Shavuot":              'holidays-shavuos',
  "Moadim U'Zmanim/Holidays|Shiva Asar b'Tamuz":   'holidays-fast-shiva-asar-btamuz',
  "Moadim U'Zmanim/Holidays|Slichot":              'holidays-fast-slichot',
  "Moadim U'Zmanim/Holidays|Taaniot (fasts)":      'holidays-fast-days-general',
  "Moadim U'Zmanim/Holidays|Tisha Bav":            'holidays-tisha-bav',
  "Moadim U'Zmanim/Holidays|Tu B'Av":              'holidays-tu-bav',
  "Moadim U'Zmanim/Holidays|Yom Tov Sheni":        'holidays-yom-tov-sheni',

  // NACH
  'Nach|Megillot':        'nach-megillot-general',
  'Nach|Chaggai':         'nach-chaggai',
  'Nach|Divrei Hayamim':  'nach-divrei-hayamim',
  'Nach|Eichah':          'nach-megillot-eichah',
  'Nach|Esther':          'nach-megillot-esther',
  'Nach|Ezra & Nechemia': 'nach-ezra-nechemia',
  'Nach|General':         'nach-general',
  'Nach|Hosheia':         'nach-hosheia',
  'Nach|Iyov':            'nach-iyov',
  'Nach|Kohelet':         'nach-megillot-kohelet',
  'Nach|Malachi':         'nach-malachi',
  'Nach|Melachim':        'nach-melachim',
  'Nach|Mishlei':         'nach-mishlei',
  'Nach|Rut':             'nach-megillot-rut',
  'Nach|Shir Hashirim':   'nach-megillot-shir-hashirim',
  'Nach|Shmuel':          'nach-shmuel',
  'Nach|Shoftim':         'nach-shoftim',
  'Nach|Tehillim':        'nach-tehillim',
  'Nach|Yechezkel':       'nach-yechezkel',
  'Nach|Yehoshua':        'nach-yehoshua',
  'Nach|Yeshayahu':       'nach-yeshayahu',
  'Nach|Yirmiyahu':       'nach-yirmiyahu',
  'Nach|Yonah':           'nach-yonah',

  // PARSHA
  'Parsha|Acharei Mot':   'vayikra-acharei',
  'Parsha|Balak':         'bamidbar-balak',
  'Parsha|Bamidbar':      'bamidbar-bamidbar',
  'Parsha|Bechukotai':    'vayikra-bechukotai',
  'Parsha|Behaalotecha':  'bamidbar-behaalotcha',
  'Parsha|Behar':         'vayikra-behar',
  'Parsha|Bereishit':     'bereishit-bereishit',
  'Parsha|Beshalach':     'shemot-beshalach',
  'Parsha|Bo':            'shemot-bo',
  'Parsha|Chayei Sara':   'bereishit-chayei-sarah',
  'Parsha|Chukat':        'bamidbar-chukat',
  'Parsha|Devarim':       'devarim-devarim',
  'Parsha|Eikev':         'devarim-eikev',
  'Parsha|Emor':          'vayikra-emor',
  'Parsha|General':       'chumash-general',
  'Parsha|Haazinu':       'devarim-haazinu',
  'Parsha|Hachodesh':     'chumash-arba-parshiyot-hachodesh',
  'Parsha|Kedoshim':      'vayikra-kedoshim',
  'Parsha|Ki Tavo':       'devarim-ki-tavo',
  'Parsha|Ki Teitzei':    'devarim-ki-teitzei',
  'Parsha|Ki Tisa':       'shemot-ki-tisa',
  'Parsha|Korach':        'bamidbar-korach',
  'Parsha|Lech Lecha':    'bereishit-lech-lecha',
  'Parsha|Masei':         'bamidbar-masei',
  'Parsha|Matot':         'bamidbar-mattot',
  'Parsha|Metzora':       'vayikra-metzora',
  'Parsha|Mikeitz':       'bereishit-miketz',
  'Parsha|Mishpatim':     'shemot-mishpatim',
  'Parsha|Naso':          'bamidbar-nasso',
  'Parsha|Nitzavim':      'devarim-nitzavim',
  'Parsha|Noach':         'bereishit-noach',
  'Parsha|Parah':         'chumash-arba-parshiyot-parah',
  'Parsha|Pekudei':       'shemot-pekudei',
  'Parsha|Pinchas':       'bamidbar-pinchas',
  "Parsha|Re'eh":         'devarim-reeh',
  'Parsha|Shekalim':      'chumash-arba-parshiyot-shekalim',
  'Parsha|Shelach':       'bamidbar-shelach',
  'Parsha|Shemini':       'vayikra-shemini',
  'Parsha|Shemot':        'shemot-shemot',
  'Parsha|Shoftim':       'devarim-shoftim',
  'Parsha|Tazria':        'vayikra-tazria',
  'Parsha|Teruma':        'shemot-terumah',
  'Parsha|Tetzaveh':      'shemot-tetzaveh',
  'Parsha|Toldot':        'bereishit-toldot',
  'Parsha|Tzav':          'vayikra-tzav',
  "Parsha|Va'era":        'shemot-vaeira',
  "Parsha|Va'etchanan":   'devarim-vaetchanan',
  'Parsha|Vayakhel':      'shemot-vayakhel',
  'Parsha|Vayechi':       'bereishit-vayechi',
  'Parsha|Vayeilech':     'devarim-vayeilech',
  'Parsha|Vayeira':       'bereishit-vayeira',
  'Parsha|Vayeishev':     'bereishit-vayeshev',
  'Parsha|Vayeitzei':     'bereishit-vayeitzei',
  'Parsha|Vayigash':      'bereishit-vayigash',
  'Parsha|Vayikra':       'vayikra-vayikra',
  'Parsha|Vayishlach':    'bereishit-vayishlach',
  'Parsha|Vezot Haberacha': 'devarim-vezot-haberachah',
  'Parsha|Yitro':         'shemot-yitro',
  'Parsha|Zachor':        'chumash-arba-parshiyot-zachor',

  // CATCH-ALL: lectures with no category assigned on YUTorah
  '|': 'misc-general',

  // PERSONALITIES → existing nodes
  'Personalities|Abarbanel':              'kisvei-rishonim-abarbanel',
  'Personalities|General':               'discussion-eulogy',
  'Personalities|Hespedim':              'discussion-eulogy',
  'Personalities|Rambam':                'kisvei-rishonim-rambam-general',
  'Personalities|Ramban':                'kisvei-rishonim-ramban',
  'Personalities|Rashba':                'kisvei-rishonim-rashba',
  'Personalities|Rav Aharon Lichtenstein': 'rav-aaron-general',
  'Personalities|Rav Yosef Dov Soloveitchik': 'rav-yd-general',
};

// ─── NEW NODE DEFINITIONS ─────────────────────────────────────────────────────
// Processed in order — parents must appear before children.
// parentId: null = top-level category
const NEW_NODES = [
  // GEMARA - new tractates
  { id: 'gemarah-aggadeta',              label: 'Aggadeta',              parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-arachin',               label: 'Arachin',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-avoda-zara',            label: 'Avoda Zara',            parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-bava-batra',            label: 'Bava Batra',            parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-bechorot',              label: 'Bechorot',              parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-beitza',                label: 'Beitza',                parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-berachot',              label: 'Berachot',              parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-chagiga',               label: 'Chagiga',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-horayot',               label: 'Horayot',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-keritut',               label: 'Keritut',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-ketuvot',               label: 'Ketuvot',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-kiddushin',             label: 'Kiddushin',             parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-makot',                 label: 'Makot',                 parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-megillah',              label: 'Megillah',              parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-meilah',                label: 'Meilah',                parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-menachot',              label: 'Menachot',              parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-moed-katan',            label: 'Moed Katan',            parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-nazir',                 label: 'Nazir',                 parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-sanhedrin',             label: 'Sanhedrin',             parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-shevuot',               label: 'Shevuot',               parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-sotah',                 label: 'Sotah',                 parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-taanit',                label: 'Taanit',                parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-temura',                label: 'Temura',                parentId: 'gemarah',              type: 'lectures' },
  { id: 'gemarah-yevamot',               label: 'Yevamot',               parentId: 'gemarah',              type: 'lectures' },
  // Yerushalmi folder + children
  { id: 'gemarah-yerushalmi',            label: 'Yerushalmi',            parentId: 'gemarah',              type: 'folder'   },
  { id: 'gemarah-yerushalmi-bava-metzia',label: 'Bava Metzia',           parentId: 'gemarah-yerushalmi',   type: 'lectures' },
  { id: 'gemarah-yerushalmi-berachot',   label: 'Berachot',              parentId: 'gemarah-yerushalmi',   type: 'lectures' },
  { id: 'gemarah-yerushalmi-shabbat',    label: 'Shabbat',               parentId: 'gemarah-yerushalmi',   type: 'lectures' },

  // HALACHA - all new
  { id: 'halacha-adar-ii',               label: 'Adar II',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-assara-btevet',         label: "Assara B'Tevet",        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-aveilut',               label: 'Aveilut',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-avodah-zarah',          label: 'Avodah Zarah',          parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-basar-bechalav',        label: 'Basar Bechalav',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-bechorot',              label: 'Bechorot',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-bein-adam-lchaveiro',   label: "Bein Adam l'Chaveiro",  parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-beit-din',              label: 'Beit Din',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-beit-hamikdash',        label: 'Beit Hamikdash',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-birchas-kohanim',       label: 'Birchas Kohanim',       parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-birchot-hatorah',       label: 'Birchot HaTorah',       parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-birkat-hamazon',        label: 'Birkat Hamazon',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-bishul',                label: 'Bishul',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-bnei-noach',            label: 'Bnei Noach',            parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-brachot',               label: 'Brachot',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-brit-milah',            label: 'Brit Milah',            parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-business',              label: 'Business',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-challah',               label: 'Challah',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-chanukah',              label: 'Chanukah',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-chatzi-shiur',          label: 'Chatzi Shiur',          parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-children',              label: 'Children',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-chinuch',               label: 'Chinuch',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-chodosh',               label: 'Chodosh',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-chol-hamoed',           label: 'Chol Hamoed',           parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-choshen-mishpat',       label: 'Choshen Mishpat',       parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-death-burial',          label: 'Death and Burial',      parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-elul',                  label: 'Elul',                  parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-eruvin',                label: 'Eruvin',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-eved-ivri',             label: 'Eved Ivri',             parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-even-haezer',           label: 'Even Haezer',           parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-family-ishut',          label: 'Family & Ishut',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-geirut',                label: 'Geirut',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-gittin',                label: 'Gittin',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-hachnasat-orchim',      label: 'Hachnasat Orchim',      parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-hechsher-keilim',       label: 'Hechsher Keilim',       parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-hilkhot-seudah',        label: 'Hilkhot Seudah',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-israel',                label: 'Israel',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kashrut',               label: 'Kashrut',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kibud-av-vaim',         label: "Kibud Av v'Aim",        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kiddush-hashem',        label: 'Kiddush Hashem',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kiddush-havdala',       label: 'Kiddush and Havdala',   parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kiddushin',             label: 'Kiddushin',             parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-kohanim',               label: 'Kohanim',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-korbanot',              label: 'Korbanot',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-lashon-harah',          label: 'Lashon Harah',          parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-lifnei-iver',           label: 'Lifnei Iver',           parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-lo-tasur',              label: 'Lo Tasur',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-maaser',                label: "Ma'aser",               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-marit-ayin',            label: 'Marit Ayin',            parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-medical-ethics',        label: 'Medical Ethics',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-medicine',              label: 'Medicine',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-mezuzah',               label: 'Mezuzah',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-mikvaot',               label: 'Mikvaot',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-minhagim',              label: 'Minhagim',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-mishkan',               label: 'Mishkan',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-muktza',                label: 'Muktza',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-netilat-yadayim',       label: 'Netilat Yadayim',       parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-nezikin',               label: 'Nezikin',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-niddah',                label: 'Niddah',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-orach-chaim',           label: 'Orach Chaim',           parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-pat-akum',              label: 'Pat Akum',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-pesach',                label: 'Pesach',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-purim',                 label: 'Purim',                 parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-rabbinic-laws',         label: 'Rabbinic Laws',         parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-rosh-hashana',          label: 'Rosh Hashana',          parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-rules-of-psak',         label: 'Rules of Psak',         parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-science-medicine',      label: 'Science & Medicine',    parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-sefirat-haomer',        label: 'Sefirat HaOmer',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shaatnez',              label: 'Shaatnez',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shabbat',               label: 'Shabbat',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shavuot',               label: 'Shavuot',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shechitah',             label: 'Shechitah',             parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-sheimos',               label: 'Sheimos',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shema',                 label: 'Shema',                 parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shemittah',             label: 'Shemittah',             parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-sheva-brachot',         label: 'Sheva Brachot',         parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-sheva-mitzvot-bnei-noach', label: "Sheva Mitzvot B'nei Noach", parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shiluach-haken',        label: 'Shiluach Haken',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shofar',                label: 'Shofar',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shtarot',               label: 'Shtarot',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-shvuot-nedarim',        label: 'Shvuot and Nedarim',    parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-sukkot',                label: 'Sukkot',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-taarovos',              label: 'Taarovos',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-taharos',               label: 'Taharos',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-talmud',                label: 'Talmud',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tefillah',              label: 'Tefillah',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-teshuvah',              label: 'Teshuvah',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tevilat-kaylim',        label: 'Tevilat Kaylim',        parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tfillin',               label: 'Tfillin',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-torah',                 label: 'Torah',                 parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tzedakah',              label: 'Tzedakah',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tzitzis',               label: 'Tzitzis',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-tzniut',                label: 'Tzniut',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-war',                   label: 'War',                   parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-weddings',              label: 'Weddings',              parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-women',                 label: 'Women',                 parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-yichud',                label: 'Yichud',                parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-yom-kippur',            label: 'Yom Kippur',            parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-yom-tov',               label: 'Yom Tov',               parentId: 'halacha', type: 'lectures' },
  { id: 'halacha-yoreh-deah',            label: 'Yoreh Deah',            parentId: 'halacha', type: 'lectures' },

  // DISCUSSION - new subfolders
  { id: 'discussion-history',                  label: 'History',                  parentId: 'discussion', type: 'folder'   },
  { id: 'discussion-history-general',          label: 'General',                  parentId: 'discussion-history', type: 'lectures' },
  { id: 'discussion-history-21st-century',     label: '21st Century CE',          parentId: 'discussion-history', type: 'lectures' },
  { id: 'discussion-history-bayit-sheni',      label: 'Bayit Sheni',              parentId: 'discussion-history', type: 'lectures' },
  { id: 'discussion-history-period-of-tanach', label: 'Period of Tanach',         parentId: 'discussion-history', type: 'lectures' },
  { id: 'discussion-midrash',                  label: 'Midrash',                  parentId: 'discussion', type: 'folder'   },
  { id: 'discussion-midrash-general',          label: 'General',                  parentId: 'discussion-midrash', type: 'lectures' },
  { id: 'discussion-midrash-rabbah-torah',     label: 'Midrash Rabbah - Torah',   parentId: 'discussion-midrash', type: 'lectures' },
  { id: 'discussion-midrash-tanchuma',         label: 'Midrash Tanchuma',         parentId: 'discussion-midrash', type: 'lectures' },
  { id: 'discussion-relationships',            label: 'Relationships',             parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-ahavat-yirat-hashem',      label: 'Ahavat/Yirat Hashem',      parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-akeidah',                  label: 'Akeidas Yitzchak',         parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-angels',                   label: 'Angels',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-avraham',                  label: 'Avraham',                  parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-bein-adam-lchaveiro',      label: "Bein Adam L'Chaveiro",     parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-beit-hamikdash',           label: 'Beit HaMikdash',           parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-bitachon',                 label: 'Bitachon',                 parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-chinuch',                  label: 'Chinuch',                  parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-derech-hashem',            label: 'Derech Hashem',            parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-dvekus',                   label: 'Dvekus',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-emunah',                   label: 'Emunah',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-ethics',                   label: 'Ethics',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-exploring-judaism',        label: 'Exploring Judaism',        parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-family-ishut',             label: 'Family & Ishut',           parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-geulah',                   label: 'Geulah',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-hashem',                   label: 'Hashem',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-ikkarei-emunah',           label: 'Ikkarei Emunah',           parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-kiruv',                    label: 'Kiruv',                    parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-leadership',               label: 'Leadership',               parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-mashiach',                 label: 'Mashiach',                 parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-middot',                   label: 'Middot',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-modern-orthodoxy',         label: 'Modern Orthodoxy',         parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-mussar',                   label: 'Mussar',                   parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-philosophy-halacha',       label: 'Philosophy of Halacha',    parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-pluralism',                label: 'Pluralism',                parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-politics',                 label: 'Politics',                 parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-prophecy',                 label: 'Prophecy',                 parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-rabbinic-authority',       label: 'Rabbinic Authority',       parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-revelation',               label: 'Revelation',               parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-reward-punishment',        label: 'Reward and Punishment',    parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-science-medicine',         label: 'Science & Medicine',       parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-shemittah',                label: 'Shemittah',                parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-simcha',                   label: 'Simcha / Happiness',       parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-supernatural',             label: 'Supernatural',             parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-tanya',                    label: 'Tanya',                    parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-teshuva',                  label: 'Teshuva',                  parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-the-avos',                 label: 'The Avos',                 parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-torah-shebaal-peh',        label: "Torah She-Ba'al Peh",      parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-torah-umadda',             label: "Torah U'Madda",            parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-women',                    label: 'Women',                    parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-zionism',                  label: 'Zionism',                  parentId: 'discussion', type: 'lectures' },

  // KISVEI RISHONIM - new entries
  { id: 'kisvei-rishonim-abarbanel',                   label: 'Abarbanel',         parentId: 'kisvei-rishonim',        type: 'lectures' },
  { id: 'kisvei-rishonim-ramban',                      label: 'Ramban',            parentId: 'kisvei-rishonim',        type: 'lectures' },
  { id: 'kisvei-rishonim-rashba',                      label: 'Rashba',            parentId: 'kisvei-rishonim',        type: 'lectures' },
  { id: 'kisvei-rishonim-kuzari',                      label: 'Kuzari',            parentId: 'kisvei-rishonim',        type: 'lectures' },
  // Shemonah Perakim under Rambam (rambam converted to folder first — see migrations)
  { id: 'kisvei-rishonim-rambam-general',              label: 'General',           parentId: 'kisvei-rishonim-rambam', type: 'lectures' },
  { id: 'kisvei-rishonim-rambam-shemonah-perakim',     label: 'Shemonah Perakim', parentId: 'kisvei-rishonim-rambam', type: 'lectures' },

  // HOLIDAYS - new nodes
  { id: 'holidays-adar',            label: 'Adar',          parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-chol-hamoed',     label: 'Chol Hamoed',   parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-elul',            label: 'Elul',          parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-lag-baomer',      label: 'Lag BaOmer',    parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-rosh-chodesh',    label: 'Rosh Chodesh',  parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-sefirat-haomer',  label: 'Sefirat HaOmer',parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-shabbat',         label: 'Shabbat',       parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-tu-bav',          label: "Tu B'Av",       parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-yom-tov',         label: 'Yom Tov',       parentId: 'holidays',              type: 'lectures' },
  { id: 'holidays-yom-tov-sheni',   label: 'Yom Tov Sheni', parentId: 'holidays',              type: 'lectures' },
  // Three Weeks folder + Fast Days subfolder
  { id: 'holidays-three-weeks',              label: 'Three Weeks',         parentId: 'holidays',               type: 'folder'   },
  { id: 'holidays-three-weeks-general',       label: 'General',             parentId: 'holidays-three-weeks',   type: 'lectures' },
  { id: 'holidays-fast-days',                label: 'Fast Days',           parentId: 'holidays-three-weeks',   type: 'folder'   },
  { id: 'holidays-fast-days-general',          label: 'General',            parentId: 'holidays-fast-days',     type: 'lectures' },
  { id: 'holidays-fast-shiva-asar-btamuz',   label: "Shiva Asar B'Tamuz", parentId: 'holidays-fast-days',     type: 'lectures' },
  { id: 'holidays-fast-assara-btevet',       label: "Assara B'Tevet",     parentId: 'holidays-fast-days',     type: 'lectures' },
  { id: 'holidays-fast-tzom-gedalia',        label: 'Tzom Gedalia',       parentId: 'holidays-fast-days',     type: 'lectures' },
  { id: 'holidays-fast-slichot',             label: 'Slichot',            parentId: 'holidays-fast-days',     type: 'lectures' },
  // Pesach → Pesach Sheni (pesach converted to folder first — see migrations)
  { id: 'holidays-pesach-general',           label: 'General',            parentId: 'holidays-pesach',        type: 'lectures' },
  { id: 'holidays-pesach-pesach-sheni',      label: 'Pesach Sheni',       parentId: 'holidays-pesach',        type: 'lectures' },

  // NACH - Megillot folder + books
  { id: 'nach-megillot',                label: 'Megillot',       parentId: 'nach', type: 'folder'   },
  { id: 'nach-megillot-esther',         label: 'Esther',         parentId: 'nach-megillot', type: 'lectures' },
  { id: 'nach-megillot-rut',            label: 'Rut',            parentId: 'nach-megillot', type: 'lectures' },
  { id: 'nach-megillot-kohelet',        label: 'Kohelet',        parentId: 'nach-megillot', type: 'lectures' },
  { id: 'nach-megillot-shir-hashirim',  label: 'Shir Hashirim',  parentId: 'nach-megillot', type: 'lectures' },
  { id: 'nach-megillot-eichah',         label: 'Eichah',         parentId: 'nach-megillot', type: 'lectures' },
  { id: 'nach-megillot-general',             label: 'General',          parentId: 'nach-megillot',           type: 'lectures' },

  // Other Nach
  { id: 'nach-chaggai',         label: 'Chaggai',         parentId: 'nach', type: 'lectures' },
  { id: 'nach-divrei-hayamim',  label: 'Divrei Hayamim',  parentId: 'nach', type: 'lectures' },
  { id: 'nach-ezra-nechemia',   label: 'Ezra & Nechemia', parentId: 'nach', type: 'lectures' },
  { id: 'nach-general',         label: 'General',         parentId: 'nach', type: 'lectures' },
  { id: 'nach-hosheia',         label: 'Hosheia',         parentId: 'nach', type: 'lectures' },
  { id: 'nach-malachi',         label: 'Malachi',         parentId: 'nach', type: 'lectures' },
  { id: 'nach-melachim',        label: 'Melachim',        parentId: 'nach', type: 'lectures' },
  { id: 'nach-shmuel',          label: 'Shmuel',          parentId: 'nach', type: 'lectures' },
  { id: 'nach-shoftim',         label: 'Shoftim',         parentId: 'nach', type: 'lectures' },
  { id: 'nach-yechezkel',       label: 'Yechezkel',       parentId: 'nach', type: 'lectures' },
  { id: 'nach-yehoshua',        label: 'Yehoshua',        parentId: 'nach', type: 'lectures' },
  { id: 'nach-yeshayahu',       label: 'Yeshayahu',       parentId: 'nach', type: 'lectures' },
  { id: 'nach-yirmiyahu',       label: 'Yirmiyahu',       parentId: 'nach', type: 'lectures' },
  { id: 'nach-yonah',           label: 'Yonah',           parentId: 'nach', type: 'lectures' },

  // MISHNA - new primary top-level folder
  { id: 'mishna',              label: 'Mishna',      parentId: null,     type: 'folder'   },
  { id: 'mishna-general',      label: 'General',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-bava-batra',   label: 'Bava Batra',  parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-bava-kamma',   label: 'Bava Kamma',  parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-bava-metzia',  label: 'Bava Metzia', parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-bechorot',     label: 'Bechorot',    parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-bikkurim',     label: 'Bikkurim',    parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-brachot',      label: 'Brachot',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-challah',      label: 'Challah',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-gittin',       label: 'Gittin',      parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-keilim',       label: 'Keilim',      parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-ketuvot',      label: 'Ketuvot',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-kilayim',      label: 'Kilayim',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-makkot',       label: 'Makkot',      parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-megillah',     label: 'Megillah',    parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-menachot',     label: 'Menachot',    parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-mikvaot',      label: 'Mikvaot',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-moed-kattan',  label: 'Moed Kattan', parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-negaim',       label: 'Negaim',      parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-pesachim',     label: 'Pesachim',    parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-shabbat',      label: 'Shabbat',     parentId: 'mishna', type: 'lectures' },
  { id: 'mishna-sukkah',       label: 'Sukkah',      parentId: 'mishna', type: 'lectures' },

  // CHUMASH - Arba Parshiyot (as direct child of chumash — chumash-general has existing lectures)
  { id: 'chumash-arba-parshiyot',           label: 'Arba Parshiyot', parentId: 'chumash',               type: 'folder'   },
  { id: 'chumash-arba-parshiyot-shekalim',  label: 'Shekalim',       parentId: 'chumash-arba-parshiyot', type: 'lectures' },
  { id: 'chumash-arba-parshiyot-zachor',    label: 'Zachor',         parentId: 'chumash-arba-parshiyot', type: 'lectures' },
  { id: 'chumash-arba-parshiyot-parah',     label: 'Parah',          parentId: 'chumash-arba-parshiyot', type: 'lectures' },
  { id: 'chumash-arba-parshiyot-hachodesh', label: 'Hachodesh',      parentId: 'chumash-arba-parshiyot', type: 'lectures' },
];

// ─── TREE HELPERS ─────────────────────────────────────────────────────────────
function findNode(categories, id) {
  for (const node of categories) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
    // nach has both lectures and children
    if (node.lectures && Array.isArray(node.lectures)) {
      // lectures are leaf items, not nodes — skip
    }
  }
  return null;
}

function getAllNodes(categories) {
  const nodes = [];
  for (const node of categories) {
    nodes.push(node);
    if (node.children) nodes.push(...getAllNodes(node.children));
  }
  return nodes;
}

// Convert a lectures node to a folder, moving its lectures to a new 'General' child
function convertToFolder(node, generalId, generalLabel) {
  if (!Array.isArray(node.lectures)) return; // already a folder
  const existingLectures = node.lectures;
  delete node.lectures;
  node.children = [
    { id: generalId, label: generalLabel, lectures: existingLectures }
  ];
  console.log(`  [MIGRATE] Converted ${node.id} → folder, moved ${existingLectures.length} lectures to ${generalId}`);
}

// Add a node to its parent
function ensureNode(categories, nodeDef) {
  if (findNode(categories, nodeDef.id)) return; // already exists

  if (nodeDef.parentId === null) {
    // Top-level category
    const newNode = nodeDef.type === 'folder'
      ? { id: nodeDef.id, label: nodeDef.label, icon: '📖', children: [] }
      : { id: nodeDef.id, label: nodeDef.label, icon: '📖', lectures: [] };
    categories.push(newNode);
    console.log(`  [NEW TOP] ${nodeDef.id}`);
    return;
  }

  const parent = findNode(categories, nodeDef.parentId);
  if (!parent) {
    console.warn(`  [WARN] Parent not found: ${nodeDef.parentId} for ${nodeDef.id}`);
    return;
  }

  const newNode = nodeDef.type === 'folder'
    ? { id: nodeDef.id, label: nodeDef.label, children: [] }
    : { id: nodeDef.id, label: nodeDef.label, lectures: [] };

  if (Array.isArray(parent.children)) {
    parent.children.push(newNode);
  } else if (Array.isArray(parent.lectures)) {
    // Parent is a lectures node — this shouldn't happen if migrations run first
    console.warn(`  [WARN] ${nodeDef.parentId} is a lectures node, cannot add child ${nodeDef.id}`);
    return;
  } else {
    parent.children = [newNode];
  }
  console.log(`  [NEW] ${nodeDef.id} → ${nodeDef.parentId}`);
}

// ─── DEDUP CHECK ──────────────────────────────────────────────────────────────
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

// ─── LECTURE BUILDER ──────────────────────────────────────────────────────────
function buildAudioUrl(doc) {
  if (!doc.shiururl) return '';
  const url = doc.shiururl.startsWith('http')
    ? doc.shiururl
    : `https://download.yutorah.org${doc.shiururl}`;
  return url;
}

function buildLecture(doc) {
  const rawDate = doc.shiurdate || '';
  const date = rawDate ? rawDate.substring(0, 10) : '';
  const durationMins = parseFloat(doc.duration) || 0;
  const durationSecs = Math.round(durationMins * 60);

  const subcats = Array.isArray(doc.subcategoryname) ? doc.subcategoryname : (doc.subcategoryname ? [doc.subcategoryname] : []);
  const series  = doc.seriesname || '';
  const tags    = [...subcats];
  if (series) tags.push(series);

  return {
    id:          `YBT-${doc.shiurid}`,
    title:       doc.shiurtitle || '',
    audioUrl:    buildAudioUrl(doc),
    duration:    durationSecs,
    description: doc.shiurdescription || '',
    speaker:     str(doc.teacherfullname),
    date,
    tags,
    sourceId:    doc.shiurid,
  };
}

// ─── FIELD HELPERS (API returns strings OR arrays) ────────────────────────────
function str(val) {
  if (Array.isArray(val)) return (val[0] || '').trim();
  if (typeof val === 'string') return val.trim();
  return '';
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
// Lectures often have multiple categories AND multiple subcategories.
// Strategy: try every cat+subcat combination, prefer the most specific match
// (i.e. a key that maps to a non-general node). Fall back to first match.
function resolveTargetId(doc) {
  // Normalise to arrays
  const cats    = [].concat(doc.categoryname    || []).map(s => s.trim()).filter(Boolean);
  const subcats = [].concat(doc.subcategoryname || []).map(s => s.trim()).filter(Boolean);
  const teacher = str(doc.teacherfullname);

  // Special: Mishna/Avot split by teacher (check all cat/subcat combos)
  for (const cat of cats) {
    for (const subcat of subcats) {
      if (cat === 'Mishna' && subcat === 'Avot') {
        return teacher === 'Rabbi Pesach Chait'
          ? 'kisvei-rishonim-rambam-shemonah-perakim'
          : 'kisvei-chazal-all';
      }
    }
  }

  // PRIORITY 1: find the most specific match — prefer nodes that are NOT
  // catch-alls (general, archived, misc). Collect all matches first.
  const GENERIC = new Set([
    'discussion-general', 'halacha-general', 'other-gemarah',
    'misc-general', 'kisvei-chazal-all',
  ]);

  let firstMatch = null;
  let specificMatch = null;

  for (const cat of cats) {
    for (const subcat of subcats) {
      const key = `${cat}|${subcat}`;
      const mapped = CATEGORY_MAP[key];
      if (mapped) {
        if (!firstMatch) firstMatch = mapped;
        if (!specificMatch && !GENERIC.has(mapped)) specificMatch = mapped;
      }
    }
    // Also try category-only fallback
    const catKey = `${cat}|`;
    if (CATEGORY_MAP[catKey]) {
      if (!firstMatch) firstMatch = CATEGORY_MAP[catKey];
    }
  }

  return specificMatch || firstMatch || null;
}

// ─── API FETCH ────────────────────────────────────────────────────────────────
async function fetchPage(page) {
  const facet = encodeURIComponent(`shiurdate:[* TO ${DATE_CAP}]`);
  const sort  = encodeURIComponent('shiurdate desc');
  const url   = `${API_BASE}?organizationID=${ORG_ID}&sort_by=${sort}&search_query=&page=${page}&facet_query=${facet}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n========================================`);
  console.log(isTest ? '  YUTorah Scraper — TEST MODE (no file writes)' : '  YUTorah Scraper — FULL MODE');
  console.log(`  Input: ${inputPath}`);
  console.log(`  Max pages: ${maxPages === Infinity ? 'all' : maxPages}`);
  console.log(`========================================\n`);

  // Load JSON
  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: ${inputPath} not found. Run from project root.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { categories } = data;

  if (!isTest) {
    // Backup
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2));
    console.log(`Backed up to ${BACKUP_PATH}\n`);

    // ── MIGRATIONS ──
    console.log('Running migrations...');

    // 1. Convert holidays-pesach to folder
    const pesachNode = findNode(categories, 'holidays-pesach');
    if (pesachNode && Array.isArray(pesachNode.lectures)) {
      convertToFolder(pesachNode, 'holidays-pesach-general', 'General');
    }

    // 2. Convert kisvei-rishonim-rambam to folder
    const rambamNode = findNode(categories, 'kisvei-rishonim-rambam');
    if (rambamNode && Array.isArray(rambamNode.lectures)) {
      convertToFolder(rambamNode, 'kisvei-rishonim-rambam-general', 'General');
    }

    console.log('Migrations complete.\n');

    // ── ENSURE ALL NEW NODES ──
    console.log('Creating new nodes...');
    for (const nodeDef of NEW_NODES) {
      ensureNode(categories, nodeDef);
    }
    console.log('Node creation complete.\n');
  } else {
    console.log('(TEST MODE: skipping migrations and node creation)\n');
  }

  // Build dedup set
  const existingIds = buildExistingIds(categories);
  console.log(`Existing lecture IDs in JSON: ${existingIds.size}`);

  // ── FETCH & ROUTE ──
  let page = 1;
  let totalFetched = 0;
  let totalAdded = 0;
  let totalSkipped = 0;
  let totalUnmapped = 0;
  const unmappedKeys = new Map();
  const testLectures = [];

  console.log('\nFetching from YUTorah API...\n');

  while (page <= maxPages) {
    let json;
    try {
      json = await fetchPage(page);
    } catch (e) {
      console.error(`Error fetching page ${page}: ${e.message}. Retrying in 3s...`);
      await sleep(3000);
      try { json = await fetchPage(page); }
      catch (e2) { console.error(`Retry failed. Skipping page ${page}.`); page++; continue; }
    }

    const numFound = json.response?.numFound || 0;
    const docs     = json.response?.docs || [];
    const totalPages = Math.ceil(numFound / PAGE_SIZE);

    if (page === 1) {
      console.log(`Total lectures on YUTorah: ${numFound} (~${totalPages} pages)\n`);
    }

    if (docs.length === 0) break;

    for (const doc of docs) {
      totalFetched++;
      const lectureId = `YBT-${doc.shiurid}`;

      // Dedup
      if (existingIds.has(lectureId)) {
        totalSkipped++;
        continue;
      }

      const targetId = resolveTargetId(doc);

      if (isTest) {
        // In test mode, just collect preview info
        if (testLectures.length < 5) {
          testLectures.push({
            id:       lectureId,
            title:    doc.shiurtitle,
            speaker:  doc.teacherfullname,
            category: doc.categoryname,
            subcat:   doc.subcategoryname,
            targetId: targetId || '⚠ UNMAPPED',
            audioUrl: buildAudioUrl(doc),
          });
        }
        continue;
      }

      if (!targetId) {
        const key = `${str(doc.categoryname)}|${str(doc.subcategoryname)}`;
        unmappedKeys.set(key, (unmappedKeys.get(key) || 0) + 1);
        totalUnmapped++;
        continue;
      }

      const targetNode = findNode(categories, targetId);
      if (!targetNode) {
        const key = `${str(doc.categoryname)}|${str(doc.subcategoryname)}`;
        unmappedKeys.set(key + ' [NODE MISSING]', (unmappedKeys.get(key + ' [NODE MISSING]') || 0) + 1);
        totalUnmapped++;
        continue;
      }

      if (!Array.isArray(targetNode.lectures)) {
        // It's a folder — add to its first lectures child or warn
        console.warn(`  [WARN] Target ${targetId} is a folder, not a lectures node. Skipping ${lectureId}.`);
        totalUnmapped++;
        continue;
      }

      const lecture = buildLecture(doc);
      targetNode.lectures.push(lecture);
      existingIds.add(lectureId);
      totalAdded++;
    }

    if (isTest) break; // only need 1 page

    process.stdout.write(`\r  Page ${page}/${totalPages} | added: ${totalAdded} | skipped: ${totalSkipped} | unmapped: ${totalUnmapped}   `);

    if (page >= totalPages) break;
    page++;
    await sleep(DELAY_MS);
  }

  console.log('\n');

  if (isTest) {
    console.log('════════════════════════════════════════');
    console.log('TEST RESULTS — first 5 lectures routed:');
    console.log('════════════════════════════════════════\n');
    for (const l of testLectures) {
      console.log(`Title:    ${l.title}`);
      console.log(`Speaker:  ${l.speaker}`);
      console.log(`Category: ${l.category} → ${l.subcat}`);
      console.log(`→ Node:   ${l.targetId}`);
      console.log(`Audio:    ${l.audioUrl}`);
      console.log('────────────────────────────────────────');
    }
    console.log('\nTo test audio URLs, paste them in your browser.');
    console.log('To run the full scrape: node scripts/yutorah-scraper.js\n');
    return;
  }

  // ── SAVE ──
  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

  console.log('════════════════════════════════════════');
  console.log('DONE');
  console.log(`  Total fetched:  ${totalFetched}`);
  console.log(`  Added:          ${totalAdded}`);
  console.log(`  Skipped (dup):  ${totalSkipped}`);
  console.log(`  Unmapped:       ${totalUnmapped}`);
  if (unmappedKeys.size > 0) {
    console.log('\n  Unmapped category keys (add to CATEGORY_MAP if needed):');
    for (const [k, count] of [...unmappedKeys.entries()].sort((a,b) => b[1]-a[1])) {
      console.log(`    ${count}x  ${k}`);
    }
  }
  console.log(`\n  Saved to: ${inputPath}`);
  console.log(`  Backup:   ${BACKUP_PATH}`);
  console.log('════════════════════════════════════════\n');
}

// Export the category map so other scripts (e.g. migrate-schneeweiss.js) can
// reuse the same "Category|Subcategory" -> nodeId backbone without copy-paste.
module.exports = { CATEGORY_MAP, NEW_NODES };

// Only run the scrape when invoked directly, not when required as a module.
if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
