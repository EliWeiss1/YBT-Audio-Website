# YUTorah → lectures.json: FINAL MAPPING SPEC
# All decisions confirmed. Ready for scripting.

================================================================================
## LEGEND
  EXISTS   = node already in lectures.json; use as-is
  RENAME   = node exists but label needs updating
  NEW      = create new node
  MERGE    = fold into existing node (no new node)
  →        = route lectures to this target node
================================================================================

---
## 1. GEMARA  (parent: `gemarah`)

YUTorah subcategory          | Action  | Target ID
-----------------------------|---------|----------------------------------
Aggadeta                     | NEW     | gemarah-aggadeta
Arachin                      | NEW     | gemarah-arachin
Avoda Zara                   | NEW     | gemarah-avoda-zara
Bava Batra                   | NEW     | gemarah-bava-batra
Bava Kamma                   | EXISTS  | baba-kama
Bava Metzia                  | EXISTS  | baba-metziah
Bechorot                     | NEW     | gemarah-bechorot
Beitza                       | NEW     | gemarah-beitza
Berachot                     | NEW     | gemarah-berachot
Chagiga                      | NEW     | gemarah-chagiga
Chullin                      | EXISTS  | chulin
Eruvin                       | EXISTS  | eruvin
General                      | EXISTS  | other-gemarah
Gittin                       | EXISTS  | gittin
Horayot                      | NEW     | gemarah-horayot
Keritut                      | NEW     | gemarah-keritut
Ketuvot                      | NEW     | gemarah-ketuvot
Kiddushin                    | NEW     | gemarah-kiddushin
Makot                        | NEW     | gemarah-makot
Megillah                     | NEW     | gemarah-megillah
Meilah                       | NEW     | gemarah-meilah
Menachot                     | NEW     | gemarah-menachot
Moed Katan                   | NEW     | gemarah-moed-katan
Nazir                        | NEW     | gemarah-nazir
Nedarim                      | EXISTS  | nedarim-gemarah
Nidah                        | EXISTS  | nidah-gemarah
Pesachim                     | EXISTS  | pesachim
Rosh Hashana                 | EXISTS  | rosh-hashana-gemarah
Sanhedrin                    | NEW     | gemarah-sanhedrin
Shabbat                      | EXISTS  | shabbos-gemarah
Shevuot                      | NEW     | gemarah-shevuot
Sotah                        | NEW     | gemarah-sotah
Sukkah                       | EXISTS  | sukkah-gemarah
Taanit                       | NEW     | gemarah-taanit
Temura                       | NEW     | gemarah-temura
Yevamot                      | NEW     | gemarah-yevamot
Yoma                         | EXISTS  | yomah
Zevachim                     | EXISTS  | zevachim

### Yerushalmi → NEW folder `gemarah-yerushalmi` (child of `gemarah`)
  Children:
    gemarah-yerushalmi-bava-metzia
    gemarah-yerushalmi-berachot
    gemarah-yerushalmi-shabbat

---
## 2. HALACHA  (parent: `halacha`)
# All NEW children of `halacha` unless noted

halacha-adar-ii              halacha-assara-btevet        halacha-aveilut
halacha-avodah-zarah         halacha-basar-bechalav       halacha-bechorot
halacha-bein-adam-lchaveiro  halacha-beit-din             halacha-beit-hamikdash
halacha-birchas-kohanim      halacha-birchot-hatorah      halacha-birkat-hamazon
halacha-bishul               halacha-bnei-noach           halacha-brachot
halacha-brit-milah           halacha-business             halacha-challah
halacha-chanukah             halacha-chatzi-shiur         halacha-children
halacha-chinuch              halacha-chodosh              halacha-chol-hamoed
halacha-choshen-mishpat      halacha-death-burial         halacha-elul
halacha-eruvin               halacha-eved-ivri            halacha-even-haezer
halacha-family-ishut         halacha-geirut               halacha-general [EXISTS]
halacha-gittin               halacha-hachnasat-orchim     halacha-hechsher-keilim
halacha-hilkhot-seudah       halacha-israel               halacha-kashrut
halacha-kibud-av-vaim        halacha-kiddush-hashem       halacha-kiddush-havdala
halacha-kiddushin            halacha-kohanim              halacha-korbanot
halacha-lashon-harah         halacha-lifnei-iver          halacha-lo-tasur
halacha-maaser               halacha-marit-ayin           halacha-medical-ethics
halacha-medicine             halacha-mezuzah              halacha-mikvaot
halacha-minhagim             halacha-mishkan              halacha-muktza
halacha-netilat-yadayim      halacha-nezikin              halacha-niddah
halacha-orach-chaim          halacha-pat-akum             halacha-pesach
halacha-purim                halacha-rabbinic-laws        halacha-rosh-hashana
halacha-rules-of-psak        halacha-science-medicine     halacha-sefirat-haomer
halacha-shaatnez             halacha-shabbat              halacha-shavuot
halacha-shechitah            halacha-sheimos              halacha-shema
halacha-shemittah            halacha-sheva-brachot        halacha-sheva-mitzvot-bnei-noach
halacha-shiluach-haken       halacha-shofar               halacha-shtarot
halacha-shvuot-nedarim       halacha-sukkot               halacha-taarovos
halacha-taharos              halacha-talmud               halacha-tefillah
halacha-teshuvah             halacha-tevilat-kaylim       halacha-tfillin
halacha-torah                halacha-tzedakah             halacha-tzitzis
halacha-tzniut               halacha-war                  halacha-weddings
halacha-women                halacha-yichud               halacha-yom-kippur
halacha-yom-tov              halacha-yoreh-deah

---
## 3. HISTORY  →  `discussion`
  NEW folder: discussion-history  (child of `discussion`)
    Children:
      discussion-history-21st-century
      discussion-history-bayit-sheni
      discussion-history-period-of-tanach

---
## 4. MACHSHAVA  →  `discussion`

YUTorah subcategory          | Action  | Target ID                          | Notes
-----------------------------|---------|------------------------------------|---------------------------------
Adar II                      | →MERGE  | holidays-adar                      | NEW in holidays
Ahavat Hashem                | RENAME  | discussion-ahavat-yirat-hashem     | Merged with Yirat Hashem (see §4a)
Akeidas Yitzchak             | NEW     | discussion-akeidah
Angels                       | NEW     | discussion-angels
Assara B'Tevet               | →MERGE  | holidays-fast-days                 | See §7
Avraham                      | NEW     | discussion-avraham
Bein Adam L'Chaveiro         | NEW     | discussion-bein-adam-lchaveiro
Beit HaMikdash               | NEW     | discussion-beit-hamikdash
Bitachon                     | NEW     | discussion-bitachon
Chanukah                     | →       | holidays-chanukah                  | EXISTS
Chinuch                      | NEW     | discussion-chinuch                 | Keep separate from Parenting
Chol Hamoed                  | →       | holidays-chol-hamoed               | NEW in holidays
Derech Hashem                | NEW     | discussion-derech-hashem
Derekh haLimud               | →MERGE  | discussion-learning-chachma        | EXISTS
Dvekus                       | NEW     | discussion-dvekus
Elul                         | →       | holidays-elul                      | NEW in holidays
Emunah                       | NEW     | discussion-emunah                  | Keep separate from Ikkarei Emunah
Ethics                       | NEW     | discussion-ethics
Exploring Judaism            | NEW     | discussion-exploring-judaism
Family & Ishut               | NEW     | discussion-family-ishut
General                      | →       | discussion-general                 | EXISTS
Geulah                       | NEW     | discussion-geulah
Hashem                       | NEW     | discussion-hashem                  | Keep separate from Ahavat/Yirat
Hebrew                       | →MERGE  | misc-general
History                      | →       | discussion-history                 | See §3
Ikkarei Emunah               | NEW     | discussion-ikkarei-emunah          | Keep separate from Emunah
Israel                       | EXISTS  | discussion-land-of-israel
Kabbalah                     | EXISTS  | discussion-kabalah
Kiruv                        | NEW     | discussion-kiruv
Kuzari                       | →       | kisvei-rishonim-kuzari             | NEW child of kisvei-rishonim (see §10)
Lag BaOmer                   | →       | holidays-lag-baomer                | NEW in holidays
Leadership                   | NEW     | discussion-leadership
Marriage                     | →MERGE  | discussion-relationships           | Sub-topic of Relationships (EXISTS)
Mashiach                     | NEW     | discussion-mashiach
Mesorah                      | →MERGE  | discussion-torah-shebaal-peh       | NEW — merged with Torah She-Ba'al Peh
Middot                       | NEW     | discussion-middot
Midrash                      | →       | discussion-midrash                 | NEW folder (see §5)
Mitzvot                      | EXISTS  | discussion-mitzvot
Modern Orthodoxy             | NEW     | discussion-modern-orthodoxy        | Keep separate from Torah U'Madda
Mussar                       | NEW     | discussion-mussar
Olam Habah                   | EXISTS  | discussion-olam-haba
Pesach                       | →       | holidays-pesach                    | EXISTS
Philosophy of Halacha        | NEW     | discussion-philosophy-halacha
Pluralism                    | NEW     | discussion-pluralism
Politics                     | NEW     | discussion-politics
Prophecy                     | NEW     | discussion-prophecy
Purim                        | →       | holidays-purim                     | EXISTS
Rabbinic Authority           | NEW     | discussion-rabbinic-authority
Rambam                       | →       | kisvei-rishonim-rambam             | EXISTS — don't duplicate
Ramban                       | →       | kisvei-rishonim-ramban             | NEW child of kisvei-rishonim
Relationships                | EXISTS  | discussion-relationships
Revelation                   | NEW     | discussion-revelation
Reward and Punishment        | NEW     | discussion-reward-punishment       | SUBFOLDER of discussion-justice
Rosh Hashana                 | →       | holidays-rosh-hashana-yom-kippur   | EXISTS
Science & Medicine           | NEW     | discussion-science-medicine
Sefirat HaOmer               | →       | holidays-sefirat-haomer            | NEW in holidays
Shabbat                      | →       | holidays-shabbat                   | NEW in holidays
Shavuot                      | →       | holidays-shavuos                   | EXISTS
Shemittah                    | NEW     | discussion-shemittah
Simcha/Happiness             | NEW     | discussion-simcha
Sukkot                       | →       | holidays-sukkos                    | EXISTS
Supernatural                 | NEW     | discussion-supernatural
Tanya                        | NEW     | discussion-tanya
Tefillah                     | EXISTS  | discussion-tefila
Teshuva                      | NEW     | discussion-teshuva                 | Keep separate from halacha-teshuvah
The Avos                     | NEW     | discussion-the-avos
Three Weeks                  | →       | holidays-three-weeks               | NEW in holidays (see §7)
Torah                        | →MERGE  | discussion-learning-chachma        | Same as existing folder
Torah She-Ba'al Peh          | NEW     | discussion-torah-shebaal-peh       | Mesorah merged into this
Torah U'Madda                | NEW     | discussion-torah-umadda            | Keep separate from Modern Orthodoxy
Tzom Gedalia                 | →MERGE  | holidays-fast-days                 | See §7
Women                        | NEW     | discussion-women
Yamim Noraim                 | →       | holidays-rosh-hashana-yom-kippur   | EXISTS
Yirat Hashem                 | →MERGE  | discussion-ahavat-yirat-hashem     | Merged with Ahavat Hashem (§4a)
Yom Kippur                   | →       | holidays-rosh-hashana-yom-kippur   | EXISTS
Yom Tov                      | →       | holidays-yom-tov                   | NEW in holidays
Zionism                      | NEW     | discussion-zionism

### §4a — RENAME: discussion-ahavat-hashem
  Old label: "Ahavat Hashem"
  New label: "Ahavat/Yirat Hashem"
  New ID:    discussion-ahavat-yirat-hashem
  Absorbs:   Ahavat Hashem (existing lectures) + Yirat Hashem (incoming)

### §4b — Reward and Punishment structure
  discussion-justice  (EXISTS)
    └── discussion-reward-punishment  (NEW child)

---
## 5. MIDRASH  →  `discussion`
  NEW folder: discussion-midrash  (child of `discussion`)
    Children:
      discussion-midrash-rabbah-torah
      discussion-midrash-tanchuma

---
## 6. MISHNA  →  special routing (NO new primary folder)

YUTorah subcategory          | Action  | Target ID                          | Notes
-----------------------------|---------|------------------------------------|---------------------------------
Avot (Teacher=R. Pesach Chait)| →      | kisvei-rishonim-rambam-shemonah-perakim | NEW child of kisvei-rishonim-rambam
Avot (all other teachers)    | →MERGE  | kisvei-chazal-all                  | Fold directly into kisvei-chazal-all (no subfolder)
Bava Batra                   | NEW     | mishna-bava-batra                  | NEW primary folder `mishna`
Bava Kamma                   | NEW     | mishna-bava-kamma
Bava Metzia                  | NEW     | mishna-bava-metzia
Bechorot                     | NEW     | mishna-bechorot
Bikkurim                     | NEW     | mishna-bikkurim
Brachot                      | NEW     | mishna-brachot
Challah                      | NEW     | mishna-challah
General                      | NEW     | mishna-general
Gittin                       | NEW     | mishna-gittin
Keilim                       | NEW     | mishna-keilim
Ketuvot                      | NEW     | mishna-ketuvot
Kilayim                      | NEW     | mishna-kilayim
Makkot                       | NEW     | mishna-makkot
Megillah                     | NEW     | mishna-megillah
Menachot                     | NEW     | mishna-menachot
Mikvaot                      | NEW     | mishna-mikvaot
Moed Kattan                  | NEW     | mishna-moed-kattan
Negaim                       | NEW     | mishna-negaim
Pesachim                     | NEW     | mishna-pesachim
Shabbat                      | NEW     | mishna-shabbat
Sukkah                       | NEW     | mishna-sukkah

  Note: `mishna` becomes a NEW primary top-level folder with all the above
  as direct children, EXCEPT Avot which is split as described above.

---
## 7. MOADIM U'ZMANIM/HOLIDAYS  →  `holidays`

YUTorah subcategory          | Action  | Target ID                          | Notes
-----------------------------|---------|------------------------------------|---------------------------------
Adar                         | NEW     | holidays-adar
Aseret Y'mei Teshuvah        | →MERGE  | holidays-rosh-hashana-yom-kippur   | EXISTS
Kislev                       | →MERGE  | holidays-chanukah                  | EXISTS
Pesach Sheni                 | NEW     | holidays-pesach-pesach-sheni       | CHILD of holidays-pesach
Rosh Chodesh                 | NEW     | holidays-rosh-chodesh
Shabbos                      | NEW     | holidays-shabbat
Shavuot                      | EXISTS  | holidays-shavuos
Shiva Asar b'Tamuz           | →MERGE  | holidays-fast-days                 | See Fast Days folder below
Slichot                      | →MERGE  | holidays-fast-days                 | Inside Fast Days folder
Taaniot (fasts)              | →MERGE  | holidays-fast-days                 | See Fast Days folder below
Tisha Bav                    | →MERGE  | holidays-three-weeks               | Child of Three Weeks (see below)
Tu B'Av                      | NEW     | holidays-tu-bav
Yom Tov Sheni                | NEW     | holidays-yom-tov-sheni

### Fast Days / Three Weeks structure:
  holidays-three-weeks  (NEW folder in holidays)
    ├── holidays-fast-days  (NEW subfolder)
    │     ├── holidays-fast-shiva-asar-btamuz
    │     ├── holidays-fast-assara-btevet
    │     ├── holidays-fast-tzom-gedalia
    │     └── holidays-fast-slichot
    └── holidays-tisha-bav  (MOVE existing node here as child)

  Feeds from:
    - Shiva Asar b'Tamuz     → holidays-fast-shiva-asar-btamuz
    - Assara B'Tevet (Moadim + Machshava) → holidays-fast-assara-btevet
    - Tzom Gedalia (Machshava) → holidays-fast-tzom-gedalia
    - Slichot                → holidays-fast-slichot
    - Tisha Bav              → holidays-tisha-bav (becomes child of three-weeks)

  Elul / Sefirat HaOmer / Lag BaOmer / Shabbat (Moadim):
    holidays-elul            (NEW direct child of holidays)
    holidays-sefirat-haomer  (NEW direct child of holidays)
    holidays-lag-baomer      (NEW direct child of holidays)
    holidays-shabbat         (NEW direct child of holidays)
    holidays-chol-hamoed     (NEW direct child of holidays)
    holidays-yom-tov         (NEW direct child of holidays)

  Pesach structure (existing + new child):
    holidays-pesach  (EXISTS)
      └── holidays-pesach-pesach-sheni  (NEW child)

---
## 8. NACH  →  `nach`

YUTorah subcategory          | Action  | Target ID
-----------------------------|---------|----------------------------------
Chaggai                      | NEW     | nach-chaggai
Divrei Hayamim               | NEW     | nach-divrei-hayamim
Eichah                       | NEW     | nach-megillot-eichah              (child of nach-megillot)
Esther                       | MOVE    | nach-megillot-esther              (child of nach-megillot)
Ezra & Nechemia              | NEW     | nach-ezra-nechemia
General                      | NEW     | nach-general
Hosheia                      | NEW     | nach-hosheia
Kohelet                      | MOVE    | nach-megillot-kohelet             (child of nach-megillot)
Malachi                      | NEW     | nach-malachi
Megillot                     | NEW     | nach-megillot                     (new folder — see below)
Melachim                     | NEW     | nach-melachim
Mishlei                      | EXISTS  | nach-mishlei                      (stays as direct nach child)
Rut                          | MOVE    | nach-megillot-rut                 (child of nach-megillot)
Shir Hashirim                | NEW     | nach-megillot-shir-hashirim       (child of nach-megillot)
Shmuel                       | NEW     | nach-shmuel
Shoftim                      | NEW     | nach-shoftim
Tehillim                     | EXISTS  | nach-tehillim                     (stays as direct nach child)
Yechezkel                    | NEW     | nach-yechezkel
Yehoshua                     | NEW     | nach-yehoshua
Yeshayahu                    | NEW     | nach-yeshayahu
Yirmiyahu                    | NEW     | nach-yirmiyahu
Yonah                        | NEW     | nach-yonah

### Megillot folder structure:
  nach-megillot  (NEW folder — child of `nach`)
    ├── nach-megillot-esther      (MOVED from nach-meggilas-esther)
    ├── nach-megillot-rut         (MOVED from nach-ruth)
    ├── nach-megillot-kohelet     (MOVED from nach-koheles)
    ├── nach-megillot-shir-hashirim (NEW)
    └── nach-megillot-eichah      (NEW)

  Note: nach-mishlei and nach-tehillim stay as direct children of `nach`
  (not in Megillot — they are not one of the five megillot).

---
## 9. PARSHA  →  `chumash`

All parshas map to existing nodes (see previous mapping doc for full table).
Four new nodes:

YUTorah subcategory          | Action  | Target ID                          | Parent
-----------------------------|---------|------------------------------------|--------------------------
Hachodesh                    | NEW     | chumash-arba-parshiyot-hachodesh   | chumash-arba-parshiyot
Parah                        | NEW     | chumash-arba-parshiyot-parah       | chumash-arba-parshiyot
Shekalim                     | NEW     | chumash-arba-parshiyot-shekalim    | chumash-arba-parshiyot
Zachor                       | NEW     | chumash-arba-parshiyot-zachor      | chumash-arba-parshiyot

### Arba Parshiyot folder structure:
  chumash-general  (EXISTS)
    └── chumash-arba-parshiyot  (NEW subfolder of chumash-general)
          ├── chumash-arba-parshiyot-shekalim
          ├── chumash-arba-parshiyot-zachor
          ├── chumash-arba-parshiyot-parah
          └── chumash-arba-parshiyot-hachodesh

---
## 10. PERSONALITIES  →  various existing parents (no new top-level folder)

YUTorah subcategory          | Action  | Target ID                          | Parent
-----------------------------|---------|------------------------------------|--------------------------
Abarbanel                    | NEW     | kisvei-rishonim-abarbanel          | kisvei-rishonim
General (personalities)      | →MERGE  | existing eulogy node               | discussion (eulogy subfolder)
Hespedim                     | →MERGE  | existing eulogy node               | discussion (eulogy subfolder)
Rambam                       | EXISTS  | kisvei-rishonim-rambam             | kisvei-rishonim
Ramban                       | NEW     | kisvei-rishonim-ramban             | kisvei-rishonim
Rashba                       | NEW     | kisvei-rishonim-rashba             | kisvei-rishonim
Rav Aharon Lichtenstein      | EXISTS  | rav-aaron-general                  | rav-aaron-soloveitchik (Misc)
Rav Yosef Dov Soloveitchik   | EXISTS  | rav-yd-general                     | rav-yd-soloveitchik

---
## 11. KISVEI RISHONIM  —  new children summary

New children to add under `kisvei-rishonim`:
  kisvei-rishonim-abarbanel    (from Personalities→Abarbanel)
  kisvei-rishonim-ramban       (from Machshava→Ramban + Personalities→Ramban)
  kisvei-rishonim-rashba       (from Personalities→Rashba)
  kisvei-rishonim-kuzari       (from Machshava→Kuzari — 36 lectures)

New child under `kisvei-rishonim-rambam`:
  kisvei-rishonim-rambam-shemonah-perakim
    ← Mishna/Avot lectures where teacherfullname contains "Rabbi Pesach Chait"

---
## 12. LECTURE ID STRATEGY for incoming YUTorah lectures
  Use YUTorah's own shiurid as the lecture ID with a prefix:
    "YBT-{shiurid}"   e.g. "YBT-1174562"
  This avoids any collision with existing local IDs (BN-*, G-*, N-*, etc.)
  and makes the source traceable.

---
## 13. AUDIO URL PATTERN for R2
  After upload, audioUrl format:
    "https://{R2_PUBLIC_URL}/YBT/{shiurid}.mp3"
  Source download URL (pre-upload):
    "https://download.yutorah.org{shiururl}"
  where shiururl from API = e.g. "/2026/22624/1174562.MP3"

---
## 14. METADATA FIELDS to capture per lecture
  id:          "YBT-{shiurid}"
  title:       shiurtitle
  audioUrl:    (R2 URL after upload)
  duration:    duration * 60  (API gives minutes; store as seconds)
  description: shiurdescription  (may be empty)
  speaker:     teacherfullname[0]
  date:        shiurdate (ISO, trim to YYYY-MM-DD)
  tags:        [subcategoryname[], seriesname (if present), language]
  series:      seriesname  (if present)
  sourceId:    shiurid  (keep for reference/dedup)
