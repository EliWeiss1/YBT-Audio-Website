# Duplicate Shiur Cleanup — August 2026

**Status: DONE.** 82 duplicate lecture records removed from `data/lectures.json`
on 2026-08-30 (commit `a9b3de1`), plus the 3 R2-hosted audio objects among them
deleted from the bucket. This file is the audit trail: methodology, every
KEEP/DELETE pair, and the near-duplicates that were investigated and
deliberately left alone (recurring weekly series, not dupes).

If a similar cleanup is needed in the future, reuse the method below rather
than re-deriving it — the "excluded" list in Part 2 is exactly the trap to
avoid (same title/rabbi/duration recurring on different dates is often a
weekly series, not a duplicate recording).

---

DUPLICATE SHIUR CLEANUP - REVIEW BEFORE DELETION
==================================================

Method: group unique lecture ids by (normalized title, normalized rabbi, exact duration),
excluding sentinel/unreliable durations (0 = never fetched, 68 = known bad-fetch value seen
104x on unrealistically short YBTArchived entries). Within a group, classify as safe-to-merge
only if members additionally share the same audio file URL (best signal) or the same date.
Groups where dates disagree and audio URLs differ were EXCLUDED (these turned out to be
recurring weekly series that coincidentally reuse the same generic title + a fixed class-slot
duration - e.g. Bnai Noach "Prayer (Set 2)" recorded on 4 different dates, or "Rambam Yud Gimel
Yesodos" taught across separate weeks - confirmed these are genuinely different recordings,
not duplicates).

Cross-listing (same id placed in multiple category nodes) was verified separately as a distinct,
intentional mechanism (confirmed: cross-listed ids share identical audioUrl across all their
placements) and is NOT touched by this cleanup - only records with DIFFERENT ids are candidates.

For each confirmed duplicate pair/group, KEEP priority: R2-hosted > YBT source > YBTArchived
source > lower numeric id. YBT is the live/current YUTorah sync; YBTArchived is a one-time 2014
dump of an old, now-defunct ybt.org database (see scripts/ybt-archive-import.js).

RESULT: 80 duplicate groups, 82 records recommended for deletion.
Only 3 of those 82 are R2-hosted (need an R2 object delete too) - the rest point to external
ybt.org/yutorah.org URLs that were never migrated to R2, so there is nothing to delete there:
  - YBT-1141906 (Schneeweiss/1141906.mp3)
  - YBTArchived-4461 (YBTArchived/YBTArchived-4461.mp3)
  - YBTArchived-433 (YBTArchived/YBTArchived-433.mp3)

==================================================
PART 1: 80 GROUPS RECOMMENDED FOR DELETION
==================================================
MATCH (same audio file URL)
  KEEP   YBT-805319         | YBT          | "Dor HaMabul" | Rabbi Yisroel Chait | 1019s | 2011-11-02 | http://www.ybt.org/audio/2011-2012/rychait/hashkafa/Dor_HaMabul_11_02_11_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1465   | YBTArchived  | "Dor HaMabul" | Rabbi Yisroel Chait | 1019s | 2011-11-02 | https://www.ybt.org/audio/2011-2012/rychait/hashkafa/Dor_HaMabul_11_02_11_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-806524         | YBT          | "Difference between Avraham and Noach" | Rabbi Yisroel Chait | 1922s | 2010-10-27 | http://www.ybt.org/audio/2010-2011/rychait/hashkafa/Difference_between_Avraham_and_Noach_10_27_10_Rabbi_Y_Chait.MP3
  DELETE YBTArchived-1552   | YBTArchived  | "Difference between Avraham and Noach" | Rabbi Yisroel Chait | 1922s | 2010-10-27 | https://www.ybt.org/audio/2010-2011/rychait/hashkafa/Difference_between_Avraham_and_Noach_10_27_10_Rabbi_Y_Chait.MP3

MATCH (same audio file URL)
  KEEP   YBT-805454         | YBT          | "Chumash - Chayei Sarah - Choosing a Wife" | Rabbi Zev Cinamon | 2262s | 2011-11-18 | http://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Chumash-Chayei_Sarah-Choosing_a_Wife_11_18_11_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4388   | YBTArchived  | "Chumash-Chayei Sarah-Choosing a Wife" | Rabbi Z. Cinamon | 2262s | 2011-11-18 | https://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Chumash-Chayei_Sarah-Choosing_a_Wife_11_18_11_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805568         | YBT          | "Parshas BeShalach - Feeding the Birds on Shabbos Shira" | Rabbi Zev Cinamon | 2509s | 2011-01-14 | http://www.ybt.org/audio/2010-2011/rzcinamon/chumash/Parshas_BeShalach-Feeding_the_Birds_on_Shabbos_Shira_01_14_11_Rabbi_Z_Cinamon.MP3
  DELETE YBTArchived-4495   | YBTArchived  | "Parshas BeShalach-Feeding the Birds on Shabbos Shira" | Rabbi Z. Cinamon | 2509s | 2011-01-14 | https://www.ybt.org/audio/2010-2011/rzcinamon/chumash/Parshas_BeShalach-Feeding_the_Birds_on_Shabbos_Shira_01_14_11_Rabbi_Z_Cinamon.MP3

MATCH (same audio file URL)
  KEEP   YBT-805652         | YBT          | "Parshas Beshalach - The Halacha of Lechem Mishne" | Rabbi Zev Cinamon | 3337s | 2010-01-29 | http://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Beshalach-The_Halacha_of_Lechem_Mishne_01_29_10_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4572   | YBTArchived  | "Parshas Beshalach-The Halacha of Lechem Mishne" | Rabbi Z. Cinamon | 3337s | 2010-01-29 | https://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Beshalach-The_Halacha_of_Lechem_Mishne_01_29_10_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805567         | YBT          | "Parsas Terumah - The Melacha of Koseiv Opening Library Books on Shabbos" | Rabbi Zev Cinamon | 2601s | 2011-02-04 | http://www.ybt.org/audio/2010-2011/rzcinamon/chumash/Parsas_Terumah-The_Melacha_of_Koseiv_Opening_Library_Books_on_Shabbos_02_04_11_Rabbi_Z_Cinamon.MP3
  DELETE YBTArchived-4494   | YBTArchived  | "Parsas Terumah-The Melacha of Koseiv Opening Library Books on Shabbos" | Rabbi Z. Cinamon | 2601s | 2011-02-04 | https://www.ybt.org/audio/2010-2011/rzcinamon/chumash/Parsas_Terumah-The_Melacha_of_Koseiv_Opening_Library_Books_on_Shabbos_02_04_11_Rabbi_Z_Cinamon.MP3

MATCH (same audio file URL)
  KEEP   YBT-805650         | YBT          | "Parshas Shmini - Fish Parasites" | Rabbi Zev Cinamon | 2888s | 2010-04-09 | http://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Shmini-Fish_Parasites_04_09_10_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4570   | YBTArchived  | "Parshas Shmini-Fish Parasites" | Rabbi Z. Cinamon | 2888s | 2010-04-09 | https://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Shmini-Fish_Parasites_04_09_10_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805647         | YBT          | "Parshas Behar - Onaas Devarim" | Rabbi Zev Cinamon | 2999s | 2010-05-07 | http://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Behar-Onaas_Devarim_05_07_10_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4567   | YBTArchived  | "Parshas Behar-Onaas Devarim" | Rabbi Z. Cinamon | 2999s | 2010-05-07 | https://www.ybt.org/audio/2009-2010/rzcinamon/chumash/Parshas_Behar-Onaas_Devarim_05_07_10_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805047         | YBT          | "Parshas Chukas - Nachash HaNechoshes" | Rabbi Pesach Chait | 2772s | 2012-11-20 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Chukas-Nachash_HaNechoshes_11_20_12_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3381   | YBTArchived  | "Parshas Chukas-Nachash HaNechoshes" | Rabbi Pesach Chait | 2772s | 2012-11-20 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Chukas-Nachash_HaNechoshes_11_20_12_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-805049         | YBT          | "Parshas Chukas - Nachash HaNechoshes" | Rabbi Pesach Chait | 2860s | 2012-10-23 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Chukas-Nachash_HaNechoshes_10_23_12_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3382   | YBTArchived  | "Parshas Chukas-Nachash HaNechoshes" | Rabbi Pesach Chait | 2860s | 2012-10-23 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Chukas-Nachash_HaNechoshes_10_23_12_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-805045         | YBT          | "Parshas Balak" | Rabbi Pesach Chait | 3368s | 2012-11-28 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Balak_11_28_12_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3380   | YBTArchived  | "Parshas Balak" | Rabbi Pesach Chait | 3368s | 2012-11-28 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Parshas_Balak_11_28_12_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-1072829        | YBT          | "Yefas Toar - Masoret" | Rabbi Reuven Mann | 6757s | 2023-08-22 | https://www.ybt.org/audio/2023-2024/rrmann/hashkafa/Masoret/2023_08_21_2023_08_22-Devarim_Ki_Seitzei_Yefas_Toar_Masoret-Rabbi_R_Mann.mp3
  DELETE YBT-1072999        | YBT          | "Yefas Toar - Masoret" | Rabbi Reuven Mann | 6757s | 2023-08-22 | https://www.ybt.org/audio/2023-2024/rrmann/hashkafa/Masoret/2023_08_21_2023_08_22-Devarim_Ki_Seitzei_Yefas_Toar_Masoret-Rabbi_R_Mann.mp3

MATCH (same audio file URL)
  KEEP   YBT-806522         | YBT          | "Dechias Mitzvos Mipnei Mikrah Megilla" | Rabbi Yisroel Chait | 1204s | 2011-03-23 | http://www.ybt.org/audio/2010-2011/rychait/hashkafa/Dechias_Mitzvos_Mipnei_Mikrah_Megilla_03_23_11_Rabbi_Y_Chait.MP3
  DELETE YBTArchived-1550   | YBTArchived  | "Dechias Mitzvos Mipnei Mikrah Megilla" | Rabbi Yisroel Chait | 1204s | 2011-03-23 | https://www.ybt.org/audio/2010-2011/rychait/hashkafa/Dechias_Mitzvos_Mipnei_Mikrah_Megilla_03_23_11_Rabbi_Y_Chait.MP3

MATCH (same audio file URL)
  KEEP   YBT-806523         | YBT          | "Dechias Mitzvos Mipnei Mikrah Megilla" | Rabbi Yisroel Chait | 3917s | 2011-03-17 | http://www.ybt.org/audio/2010-2011/rychait/hashkafa/Dechias_Mitzvos_Mipnei_Mikrah_Megilla_03_17_11_Rabbi_Y_Chait.MP3
  DELETE YBTArchived-1551   | YBTArchived  | "Dechias Mitzvos Mipnei Mikrah Megilla" | Rabbi Yisroel Chait | 3917s | 2011-03-17 | https://www.ybt.org/audio/2010-2011/rychait/hashkafa/Dechias_Mitzvos_Mipnei_Mikrah_Megilla_03_17_11_Rabbi_Y_Chait.MP3

MATCH (same audio file URL)
  KEEP   YBT-804977         | YBT          | "Rashba - Leah Giving Hodaah to Hashem" | Rabbi Pesach Chait | 2124s | 2013-02-17 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Leah_Giving_Hodaah_to_Hashem_02_17_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3359   | YBTArchived  | "Rashba-Leah Giving Hodaah to Hashem" | Rabbi Pesach Chait | 2124s | 2013-02-17 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Leah_Giving_Hodaah_to_Hashem_02_17_13_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-847229         | YBT          | "Omer Davar Beshem Omro" | Rabbi E. Feder | 2245s | 2013-06-04 | http://ybt.org/students/2012-2013/refeder/Omer_Davar_Beshem_Omro_06_04_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4888   | YBTArchived  | "Omer Davar Beshem Omro" | Rabbi E. Feder | 2245s | 2013-06-04 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Omer_Davar_Beshem_Omro_06_04_13_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-847210         | YBT          | "Devekus to Hashem" | Rabbi E. Feder | 1530s | 2012-11-17 | http://ybt.org/students/2012-2013/refeder/Devekus_to_Hashem_11_17_12_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4903   | YBTArchived  | "Devekus to Hashem" | Rabbi E. Feder | 1530s | 2012-11-17 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Devekus_to_Hashem_11_17_12_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-807110         | YBT          | "Why Yeshivas Emphasize Gemara" | Rabbi E. Feder | 3487s | 2012-01-19 | http://ybt.org/students/2011-2012/refeder/Why_Yeshivas_Emphasize_Gemara_01_19_12_Rabbi_E_Feder.mp3
  DELETE YBTArchived-5047   | YBTArchived  | "Why Yeshivas Emphasize Gemara" | Rabbi E. Feder | 3487s | 2011-12-19 | https://www.ybt.org/students/2011-2012/refeder/Why_Yeshivas_Emphasize_Gemara_01_19_12_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-807306         | YBT          | "Freedom" | Rabbi E. Feder | 3187s | 2011-05-24 | http://ybt.org/students/2010-2011/refeder/Freedom_05_24_11_Rabbi_E_Feder.MP3
  DELETE YBTArchived-5200   | YBTArchived  | "Freedom" | Rabbi E. Feder | 3187s | 2011-05-24 | https://www.ybt.org/students/2010-2011/refeder/Freedom_05_24_11_Rabbi_E_Feder.MP3

MATCH (same date)
  KEEP   YBT-847222         | YBT          | "Q & A-Natural Man and Free Will" | Rabbi E. Feder | 3744s | 2013-04-06 | http://ybt.org/students/2012-2013/refeder/Q_&_A-Natural_Man_and_Free_Will_04_06_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4894   | YBTArchived  | "Q&A-Natural Man and Free Will" | Rabbi E. Feder | 3744s | 2013-04-06 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-Natural_Man_and_Free_Will_04_06_13_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-805325         | YBT          | "Baruch Shem Kevod Malchuso LeOlam Vaed" | Rabbi Yisroel Chait | 2896s | 2011-12-01 | http://www.ybt.org/audio/2011-2012/rychait/halacha/Baruch_Shem_Kevod_Malchuso_LeOlam_Vaed_12_01_11_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1470   | YBTArchived  | "Baruch Shem Kevod Malchuso LeOlam Vaed" | Rabbi Yisroel Chait | 2896s | 2011-12-01 | https://www.ybt.org/audio/2011-2012/rychait/halacha/Baruch_Shem_Kevod_Malchuso_LeOlam_Vaed_12_01_11_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-806677         | YBT          | "Nivul Peh" | Rabbi Pesach Chait | 3056s | 2008-01-04 | http://www.ybt.org/audio/2007-2008/rpchait/hashkafa/Nivel_Peh_01_04_08_Rabbi_P_Chait.mp3
  DELETE YBTArchived-4040   | YBTArchived  | "Nivul Peh" | Rabbi Pesach Chait | 3056s | 2008-01-04 | https://www.ybt.org/audio/2007-2008/rpchait/hashkafa/Nivel_Peh_01_04_08_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-847228         | YBT          | "Q & A-Giving Rebuke, the Torahs Expectations" | Rabbi E. Feder | 3058s | 2013-06-01 | http://ybt.org/students/2012-2013/refeder/Q_&_A-Giving_Rebuke,_the_Torahs_Expectations_06_01_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4889   | YBTArchived  | "Q&A-Giving Rebuke the Torahs Expectations" | Rabbi E. Feder | 3058s | 2013-06-01 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-Giving_Rebuke_the_Torahs_Expectations_06_01_13_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-806357         | YBT          | "Love and Happiness" | Rabbi Pesach Chait | 1860s | 2008-11-04 | http://www.ybt.org/audio/2008-2009/rpchait/Hashkafa/Love_and_Happiness_11_04_08_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3916   | YBTArchived  | "Love and Happiness" | Rabbi Pesach Chait | 1860s | 2008-11-04 | https://www.ybt.org/audio/2008-2009/rpchait/Hashkafa/Love_and_Happiness_11_04_08_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-806381         | YBT          | "Love and Happiness" | Rabbi Pesach Chait | 4348s | 2008-10-28 | http://www.ybt.org/audio/2008-2009/rpchait/Hashkafa/Love_and_Happiness_10_28_08_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3917   | YBTArchived  | "Love and Happiness" | Rabbi Pesach Chait | 4348s | 2008-10-28 | https://www.ybt.org/audio/2008-2009/rpchait/Hashkafa/Love_and_Happiness_10_28_08_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-847233         | YBT          | "Q & A-Keeping Mitzvos and Miracles" | Rabbi E. Feder | 3541s | 2013-07-13 | http://ybt.org/students/2012-2013/refeder/Q_&_A-Keeping_Mitzvos_and_Miracles_07_13_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4886   | YBTArchived  | "Q&A-Keeping Mitzvos and Miracles" | Rabbi E. Feder | 3541s | 2013-07-13 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-Keeping_Mitzvos_and_Miracles_07_13_13_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-847227         | YBT          | "Q & A-13 Middos, Torah Codes, and Marriage" | Rabbi E. Feder | 4592s | 2013-05-18 | http://ybt.org/students/2012-2013/refeder/Q_&_A-13_Middos,_Torah_Codes,_and_Marriage_05_18_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4890   | YBTArchived  | "Q&A-13 Middos Torah Codes and Marriage" | Rabbi E. Feder | 4592s | 2013-05-18 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-13_Middos_Torah_Codes_and_Marriage_05_18_13_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-847225         | YBT          | "Q & A-Counting Jews, Mesora and Machlokes" | Rabbi E. Feder | 3446s | 2013-05-11 | http://ybt.org/students/2012-2013/refeder/Q_&_A-Counting_Jews,_Mesora_and_Machlokes_05_11_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4891   | YBTArchived  | "Q&A-Counting Jews Mesora and Machlokes" | Rabbi E. Feder | 3446s | 2013-05-11 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-Counting_Jews_Mesora_and_Machlokes_05_11_13_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-847212         | YBT          | "Q & A" | Rabbi E. Feder | 5127s | 2012-12-29 | http://ybt.org/students/2012-2013/refeder/Q_&_A_12_29_12_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4901   | YBTArchived  | "Q & A" | Rabbi E. Feder | 5127s | 2012-12-29 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A_12_29_12_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-847223         | YBT          | "Q & A-Tzitzis, Getting Brachos, Learning Gemara Skills" | Rabbi E. Feder | 5065s | 2013-04-13 | http://ybt.org/students/2012-2013/refeder/Q_&_A-Tzitzis,_Getting_Brachos,_Learning_Gemara_Skills_04_13_13_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4893   | YBTArchived  | "Q&A-Tzitzis Getting Brachos Learning Gemara Skills" | Rabbi E. Feder | 5065s | 2013-04-13 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/Q_&_A-Tzitzis_Getting_Brachos_Learning_Gemara_Skills_04_13_13_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-806806         | YBT          | "Science" | Rabbi Pesach Chait | 3096s | 2007-05-09 | http://ybt.org/audio/2006-2007/rpchait/Science_05_09_07_Rabbi_P_Chait.mp3
  DELETE YBTArchived-4135   | YBTArchived  | "Science" | Rabbi Pesach Chait | 3096s | 2007-05-09 | https://www.ybt.org/audio/2006-2007/rpchait/Science_05_09_07_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804948         | YBT          | "Rashba - The Order of Tefilla" | Rabbi Pesach Chait | 2305s | 2013-06-09 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-The_Order_of_Tefilla_06_09_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3351   | YBTArchived  | "Rashba-The Order of Tefilla" | Rabbi Pesach Chait | 2305s | 2013-06-09 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-The_Order_of_Tefilla_06_09_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804950         | YBT          | "Rashba - The Order of Tefilla" | Rabbi Pesach Chait | 2199s | 2013-05-26 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-The_Order_of_Tefilla_05_26_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3352   | YBTArchived  | "Rashba-The Order of Tefilla" | Rabbi Pesach Chait | 2199s | 2013-05-26 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-The_Order_of_Tefilla_05_26_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804957         | YBT          | "Rashba - Shikor BeTefilla" | Rabbi Pesach Chait | 1845s | 2013-04-14 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Shikor_BeTefilla_04_14_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3356   | YBTArchived  | "Rashba-Shikor BeTefilla" | Rabbi Pesach Chait | 1845s | 2013-04-14 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Shikor_BeTefilla_04_14_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804961         | YBT          | "Rashba - How to Stand in Tefillah" | Rabbi Pesach Chait | 2286s | 2013-03-03 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-How_to_Stand_in_Tefillah_03_03_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3358   | YBTArchived  | "Rashba-How to Stand in Tefillah" | Rabbi Pesach Chait | 2286s | 2013-03-03 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-How_to_Stand_in_Tefillah_03_03_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804962         | YBT          | "Rashba - Koveah Makom Tefilla" | Rabbi Pesach Chait | 1984s | 2013-02-10 | http://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Koveah_Makom_Tefilla_02_10_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3360   | YBTArchived  | "Rashba-Koveah Makom Tefilla" | Rabbi Pesach Chait | 1984s | 2013-02-10 | https://www.ybt.org/audio/2012-2013/rpchait/hashkafa/Rashba-Koveah_Makom_Tefilla_02_10_13_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-847209         | YBT          | "U'vchein Tein Pachdecha and Teshuva" | Rabbi E. Feder | 3225s | 2012-09-20 | http://ybt.org/students/2012-2013/refeder/U'vchein_Tein_Pachdecha_and_Teshuva_09_20_12_Rabbi_E_Feder.mp3
  DELETE YBTArchived-4904   | YBTArchived  | "U'vchein Tein Pachdecha and Teshuva" | Rabbi E. Feder | 3225s | 2012-09-20 | https://www.ybt.org/students/2012-2013/refeder/hashkafa/U'vchein_Tein_Pachdecha_and_Teshuva_09_20_12_Rabbi_E_Feder.mp3

MATCH (same audio file URL)
  KEEP   YBT-805456         | YBT          | "_Asres Ymei Teshuva Thoughts For Bnei Torah 2" | Rabbi Zev Cinamon | 901s | 2011-10-04 | http://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Asres_Ymei_Teshuva_Thoughts_For_Bnei_Torah_2_10_04_11_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4390   | YBTArchived  | "Asres Ymei Teshuva Thoughts For Bnei Torah 2" | Rabbi Z. Cinamon | 901s | 2011-10-04 | https://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Asres_Ymei_Teshuva_Thoughts_For_Bnei_Torah_2_10_04_11_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805457         | YBT          | "Asres Ymei Teshuva Thoughts For Bnei Torah 1" | Rabbi Zev Cinamon | 1587s | 2011-10-03 | http://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Asres_Ymei_Teshuva_Thoughts_For_Bnei_Torah_1_10_03_11_Rabbi_Z_Cinamon.mp3
  DELETE YBTArchived-4391   | YBTArchived  | "Asres Ymei Teshuva Thoughts For Bnei Torah 1" | Rabbi Z. Cinamon | 1587s | 2011-10-03 | https://www.ybt.org/audio/2011-2012/rzcinamon/hashkafa/Asres_Ymei_Teshuva_Thoughts_For_Bnei_Torah_1_10_03_11_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-805819         | YBT          | "Teshuvah - The Role of Viduy" | Rabbi Pesach Chait | 3249s | 2011-10-04 | http://www.ybt.org/audio/2011-2012/rpchait/hashkafa/Teshuvah-The_Role_of_Viduy_10_04_11_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3533   | YBTArchived  | "Teshuvah-The Role of Viduy" | Rabbi Pesach Chait | 3249s | 2011-10-04 | https://www.ybt.org/audio/2011-2012/rpchait/hashkafa/Teshuvah-The_Role_of_Viduy_10_04_11_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804079         | YBT          | "Rambam-Hilchos Brachos 6:4" | Rabbi Yisroel Chait | 612s | 2013-03-02 | http://www.ybt.org/audio/2012-2013/rychait/halacha/Rambam-Hilchos_Brachos_Perek_6_Halacha_4_05_02_13_Rabbi_Y_Chait.MP3
  DELETE YBTArchived-1359   | YBTArchived  | "Rambam-Hilchos Brachos 6:4" | Rabbi Yisroel Chait | 612s | 2013-03-02 | https://www.ybt.org/audio/2012-2013/rychait/halacha/Rambam-Hilchos_Brachos_Perek_6_Halacha_4_05_02_13_Rabbi_Y_Chait.MP3

MATCH (same audio file URL)
  KEEP   YBT-835684         | YBT          | "Dating A Kesubah 3" | Rabbi Zev Cinamon | 2437s | 2015-05-04 | http://ybt.org/audio/2014-2015/rzcinamon/halacha/Dating_A_Kesubah_3_5_4_15_Rabbi_Z_Cinamon.mp3
  DELETE YBT-836650         | YBT          | "Dating A Kesubah 3 " | Rabbi Zev Cinamon | 2437s | 2015-05-05 | http://ybt.org/audio/2014-2015/rzcinamon/halacha/Dating_A_Kesubah_3_5_4_15_Rabbi_Z_Cinamon.mp3

MATCH (same audio file URL)
  KEEP   YBT-806526         | YBT          | "Shaving During Omer" | Rabbi Yisroel Chait | 378s | 2011-06-03 | http://www.ybt.org/audio/2010-2011/rychait/gemara/Shaving_during_omer_06_03_11_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1554   | YBTArchived  | "Shaving during omer" | Rabbi Yisroel Chait | 378s | 2011-05-20 | https://www.ybt.org/audio/2010-2011/rychait/gemara/Shaving_during_omer_06_03_11_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-806183         | YBT          | "Krias Shema" | Rabbi Pesach Chait | 2934s | 2009-10-15 | http://www.ybt.org/audio/2009-2010/rpchait/gemara/Krias_Shema_10_15_09_Rabbi_P_Chait.mp3
  DELETE YBT-806221         | YBT          | "Krias Shema" | Rabbi Pesach Chait | 2934s | 2009-10-15 | http://www.ybt.org/audio/2009-2010/rpchait/gemara/Krias_Shema_10_15_09_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-806528         | YBT          | "Holding Tzitzis During Krias Shema" | Rabbi Yisroel Chait | 822s | 2011-03-31 | http://www.ybt.org/audio/2010-2011/rychait/halacha/holding_Tzitzis_during_krias_shema_03_31_11_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1556   | YBTArchived  | "holding Tzitzis during krias shema" | Rabbi Yisroel Chait | 822s | 2010-03-31 | https://www.ybt.org/audio/2010-2011/rychait/halacha/holding_Tzitzis_during_krias_shema_03_31_11_Rabbi_Y_Chait.mp3

MATCH (same date)
  KEEP   YBT-1033472        | YBT          | "Shmitta #16 - pruzbul - gittin 36b" | Rabbi E. Feder | 2700s | 2022-05-04 | https://download.yutorah.org/2022/22624/1033472.MP3
  DELETE YBT-1033805        | YBT          | "Shmitta #16 - pruzbul - gittin 36b" | Rabbi E. Feder | 2700s | 2022-05-04 | https://download.yutorah.org/2022/22624/1033805.MP3

MATCH (same date)
  KEEP   YBT-1032685        | YBT          | "Shmitta 13 pruzbul - gittin 36b" | Rabbi E. Feder | 2580s | 2022-04-25 | https://download.yutorah.org/2022/22624/1032685.MP3
  DELETE YBT-1033145        | YBT          | "Shmitta 13 pruzbul - gittin 36b" | Rabbi E. Feder | 2580s | 2022-04-25 | https://download.yutorah.org/2022/22624/1033145.MP3

MATCH (same audio file URL)
  KEEP   YBT-802537         | YBT          | "Inyonei Chanukah" | Rabbi Yisroel Chait | 1186s | 2013-11-29 | http://www.ybt.org/audio/2013-2014/rychait/gemara/Inyonei_Chanukah_11_29_13_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-39     | YBTArchived  | "Inyonei Chanukah" | Rabbi Yisroel Chait | 1186s | 2013-11-29 | https://www.ybt.org/audio/2013-2014/rychait/gemara/Inyonei_Chanukah_11_29_13_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-807844         | YBT          | "Rambam Hilchos Avodah Zarah Perek 1" | Rabbi David Markowitz | 3591s | 2013-04-26 | http://ybt.org/audio/2012-2013/rdmarkowitz/Rambam_Hilchos_Avodah_Zarah_Perek_1_04_26_13_Rabbi_D_Markowitz.mp3
  DELETE YBTArchived-343    | YBTArchived  | "Rambam Hilchos Avodah Zarah Perek 1" | Rabbi D. Markowitz | 3591s | 2013-04-26 | https://www.ybt.org/audio/2012-2013/rdmarkowitz/Rambam_Hilchos_Avodah_Zarah_Perek_1_04_26_13_Rabbi_D_Markowitz.mp3

MATCH (same date)
  KEEP   YBT-1171061        | YBT          | "Rambam Shmoheh Prakim perek 8 pt 9" | Rabbi Pesach Chait | 2940s | 2026-03-13 | https://download.yutorah.org/2026/22624/1171061.MP3
  DELETE YBT-1174378        | YBT          | "Rambam Shmoheh Prakim perek 8 pt 9" | Rabbi Pesach Chait | 2940s | 2026-03-13 | https://download.yutorah.org/2026/22624/1174378.MP3

MATCH (same date)
  KEEP   YBT-1018641        | YBT          | "Sunday Shiur: The Miraculous Tales of Rabbi Chanina ben Dosa #2" | Rabbi E. Feder | 7200s | 2021-11-28 | https://download.yutorah.org/2021/22624/1018641.MP3
  DELETE YBT-1018642        | YBT          | "Sunday Shiur: The Miraculous Tales of Rabbi Chanina ben Dosa #2" | Rabbi E. Feder | 7200s | 2021-11-28 | https://download.yutorah.org/2021/22624/1018642.MP3
  DELETE YBT-1018646        | YBT          | "Sunday Shiur: The Miraculous Tales of Rabbi Chanina ben Dosa #2" | Rabbi E. Feder | 7200s | 2021-11-28 | https://download.yutorah.org/2021/22624/1018646.MP3

MATCH (same audio file URL)
  KEEP   YBT-807645         | YBT          | "Rodef - Griz Perek 1 Halacha 13" | Rabbi E. Feder | 101s | 2009-11-25 | http://ybt.org/students/2009-2010/refeder/Rodef-Griz_Perek_1_Halacha_13_11_25_09_Rabbi_E_Feder.mp3
  DELETE YBTArchived-5326   | YBTArchived  | "Rodef-Griz Perek 1 Halacha 13" | Rabbi E. Feder | 101s | 2009-11-25 | https://www.ybt.org/students/2009-2010/refeder/Rodef-Griz_Perek_1_Halacha_13_11_25_09_Rabbi_E_Feder.mp3

MATCH (same date)
  KEEP   YBT-1141649        | YBT          | "Mishlei 12:25 - Don't Worry, Be Happy (Part 2)" | Rabbi Matt Schneeweiss | 2602s | 2020-11-05 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Schneeweiss/1141649.mp3
  DELETE YBT-1141906        | YBT          | "Mishlei 12:25 - Don't Worry, Be Happy (Part 2)" | Rabbi Matt Schneeweiss | 2602s | 2020-11-05 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Schneeweiss/1141906.mp3

MATCH (same date)
  KEEP   YBT-1143930        | YBT          | "Mishlei 19:15 - Are You Tired and Hungry or Just Lazy?" | Rabbi Matt Schneeweiss | 2640s | 2021-02-16 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Schneeweiss/1143930.mp3
  DELETE YBT-1032444        | YBT          | "Mishlei 19:15 - Are You Tired and Hungry or Just Lazy?" | Rabbi Matt Schneeweiss | 2640s | 2021-02-16 | https://download.yutorah.org/2021/22624/1032444.MP3

MATCH (same date)
  KEEP   YBT-1032410        | YBT          | "Mishlei 10:13 - The Crossroads on the Path to Becoming a Creative Thinker" | Rabbi Matt Schneeweiss | 5640s | 2021-02-01 | https://download.yutorah.org/2021/22624/1032410.MP3
  DELETE YBT-1032418        | YBT          | "Mishlei 10:13 - The Crossroads on the Path to Becoming a Creative Thinker" | Rabbi Matt Schneeweiss | 5640s | 2021-02-01 | https://download.yutorah.org/2021/22624/1032418.MP3

MATCH (same date)
  KEEP   YBT-1120462        | YBT          | "Machlokes man vs. God, Moshe and the Slav, Shmuel and the request for a king: part 2" | Rabbi Moshe Fistel | 5400s | 2024-12-29 | https://download.yutorah.org/2024/22624/1120462.MP3
  DELETE YBT-1152781        | YBT          | "Machlokes man vs. God, Moshe and the Slav, Shmuel and the request for a king part 2" | Rabbi Moshe Fistel | 5400s | 2024-12-29 | https://download.yutorah.org/2025/22624/1152781.MP3

MATCH (same date)
  KEEP   YBT-1120185        | YBT          | "Machlokes man vs. God, Moshe and the Slav, Shmuel and the request for a king" | Rabbi Moshe Fistel | 5040s | 2024-12-22 | https://download.yutorah.org/2024/22624/1120185.MP3
  DELETE YBT-1152779        | YBT          | "Machlokes man vs. God, Moshe and the Slav, Shmuel and the request for a king" | Rabbi Moshe Fistel | 5040s | 2024-12-22 | https://download.yutorah.org/2025/22624/1152779.MP3

MATCH (same date)
  KEEP   YBT-1171066        | YBT          | "Pesachim 117 Birkas Hashir" | Rabbi Pesach Chait | 3480s | 2026-03-26 | https://download.yutorah.org/2026/22624/1171066.MP3
  DELETE YBT-1174384        | YBT          | "Pesachim 117 Birkas Hashir" | Rabbi Pesach Chait | 3480s | 2026-03-26 | https://download.yutorah.org/2026/22624/1174384.MP3

MATCH (same date)
  KEEP   YBT-1171065        | YBT          | "Pesachim 116b Mishna and 117b Kos on Birkas Hamazon, Rosh" | Rabbi Pesach Chait | 3720s | 2026-03-24 | https://download.yutorah.org/2026/22624/1171065.MP3
  DELETE YBT-1174383        | YBT          | "Pesachim 116b Mishna and 117b Kos on Birkas Hamazon, Rosh" | Rabbi Pesach Chait | 3720s | 2026-03-24 | https://download.yutorah.org/2026/22624/1174383.MP3

MATCH (same date)
  KEEP   YBT-1171064        | YBT          | "Pesachim 116b Hallel in the Seder" | Rabbi Pesach Chait | 2700s | 2026-03-23 | https://download.yutorah.org/2026/22624/1171064.MP3
  DELETE YBT-1174382        | YBT          | "Pesachim 116b Hallel in the Seder" | Rabbi Pesach Chait | 2700s | 2026-03-23 | https://download.yutorah.org/2026/22624/1174382.MP3

MATCH (same audio file URL)
  KEEP   YBT-805075         | YBT          | "Pesachim 108b - 4 Kosos - Griz" | Rabbi Pesach Chait | 2664s | 2013-03-13 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Pesachim_108b-4_Kosos-Griz_03_13_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3322   | YBTArchived  | "Pesachim 108b-4 Kosos-Griz" | Rabbi Pesach Chait | 2664s | 2013-03-13 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Pesachim_108b-4_Kosos-Griz_03_13_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-803842         | YBT          | "Pesachim 70a" | Rabbi Yisroel Chait | 640s | 2013-03-07 | http://www.ybt.org/audio/2012-2013/rychait/gemara/Pesachim_70a_03_07_13_Rabbi_Y_Chait.MP3
  DELETE YBTArchived-1329   | YBTArchived  | "Pesachim 70a" | Rabbi Yisroel Chait | 640s | 2013-03-07 | https://www.ybt.org/audio/2012-2013/rychait/gemara/Pesachim_70a_03_07_13_Rabbi_Y_Chait.MP3

MATCH (same date)
  KEEP   YBT-975648         | YBT          | "Shabbos 70b-71a - Kotzer Gorer Kotzer: Svara" | Rabbi Pesach Chait | 3420s | 2020-10-29 | https://download.yutorah.org/2020/22624/975648.MP3
  DELETE YBT-975649         | YBT          | "Shabbos 70b-71a - Kotzer Gorer Kotzer: Svara" | Rabbi Pesach Chait | 3420s | 2020-10-29 | https://download.yutorah.org/2020/22624/975649.MP3
  DELETE YBT-975650         | YBT          | "Shabbos 70b-71a - Kotzer Gorer Kotzer: Svara" | Rabbi Pesach Chait | 3420s | 2020-10-29 | https://download.yutorah.org/2020/22624/975650.MP3

MATCH (same audio file URL)
  KEEP   YBT-805070         | YBT          | "Shabbos 120a-b - Grama" | Rabbi Pesach Chait | 2048s | 2013-06-13 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Shabbos_120a-b-Grama_06_13_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3319   | YBTArchived  | "Shabbos 120a-b-Grama" | Rabbi Pesach Chait | 2048s | 2013-06-13 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Shabbos_120a-b-Grama_06_13_13_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-805529         | YBT          | "Sukkah 25b - Hesech HaDaas for Tefilin" | Rabbi Zev Cinamon | 1590s | 2010-11-09 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/YBTArchived/YBT-805529.mp3
  DELETE YBTArchived-4461   | YBTArchived  | "Sukkah 25b-Hesech HaDaas for Tefilin" | Rabbi Z. Cinamon | 1590s | 2010-11-09 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/YBTArchived/YBTArchived-4461.mp3

MATCH (same audio file URL)
  KEEP   YBT-803724         | YBT          | "Bava Kamma 56b-Tosfos Pshitah" | Rabbi Yisroel Chait | 1016s | 2013-05-03 | http://www.ybt.org/audio/2012-2013/rychait/gemara/Bava_Kamma_56b-Tosfos_Pshitah_05_03_13_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1285   | YBTArchived  | "Bava Kamma 56b-Tosfos Pshitah" | Rabbi Yisroel Chait | 1016s | 2013-05-03 | https://www.ybt.org/audio/2012-2013/rychait/gemara/Bava_Kamma_56b-Tosfos_Pshitah_05_03_13_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804819         | YBT          | "Gitin 83a-Perek 9-Hamegaresh-Rashba" | Rabbi Pesach Chait | 3585s | 2014-01-30 | http://www.ybt.org/audio/2013-2014/rpchait/gemara/Gitin_83a-Perek_9-Hamegaresh-Rashba_01_30_14_Rabbi_P_Chait.mp3
  DELETE YBTArchived-223    | YBTArchived  | "Gitin 83a-Perek 9-Hamegaresh-Rashba" | Rabbi Pesach Chait | 3585s | 2014-01-30 | https://www.ybt.org/audio/2013-2014/rpchait/gemara/Gitin_83a-Perek_9-Hamegaresh-Rashba_01_30_14_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-803694         | YBT          | "Zevachim 47a-Eizehu Mekoman-Krisus 18a" | Rabbi Yisroel Chait | 1925s | 2013-07-31 | http://www.ybt.org/audio/2012-2013/rychait/gemara/Zevachim_47a-Eizehu_Mekoman-Krisus_18a_07_31_13_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1271   | YBTArchived  | "Zevachim 47a-Eizehu Mekoman-Krisus 18a" | Rabbi Yisroel Chait | 1925s | 2013-07-31 | https://www.ybt.org/audio/2012-2013/rychait/gemara/Zevachim_47a-Eizehu_Mekoman-Krisus_18a_07_31_13_Rabbi_Y_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-803706         | YBT          | "Zevachim 47a-Eizehu Mekoman-Tosfos" | Rabbi Yisroel Chait | 3234s | 2013-06-21 | http://www.ybt.org/audio/2012-2013/rychait/gemara/Zevachim_47a-Eizehu_Mekoman-Tosfos_06_21_13_Rabbi_Y_Chait.mp3
  DELETE YBTArchived-1282   | YBTArchived  | "Zevachim 47a-Eizehu Mekoman-Tosfos" | Rabbi Yisroel Chait | 3234s | 2013-06-21 | https://www.ybt.org/audio/2012-2013/rychait/gemara/Zevachim_47a-Eizehu_Mekoman-Tosfos_06_21_13_Rabbi_Y_Chait.mp3

MATCH (same date)
  KEEP   YBT-1023414        | YBT          | "Avoda Zara 64a conclusion" | Rabbi Pesach Chait | 3120s | 2022-01-18 | https://download.yutorah.org/2022/22624/1023414.MP3
  DELETE YBT-1024500        | YBT          | "Avoda Zara 64a conclusion" | Rabbi Pesach Chait | 3120s | 2022-01-18 | https://download.yutorah.org/2022/22624/1024500.MP3

MATCH (same audio file URL)
  KEEP   YBT-804195         | YBT          | "Megillah 21a-b" | Rabbi David Markowitz | 3061s | 2014-01-27 | http://www.ybt.org/audio/2013-2014/rdmarkowitz/Megillah_21a-b_01_27_14_Rabbi_D_Markowitz.mp3
  DELETE YBTArchived-333    | YBTArchived  | "Megillah 21a-b" | Rabbi D. Markowitz | 3061s | 2014-01-27 | https://www.ybt.org/audio/2013-2014/rdmarkowitz/Megillah_21a-b_01_27_14_Rabbi_D_Markowitz.mp3

MATCH (same date)
  KEEP   YBT-808894         | YBT          | "Megilla 26b - Tashmish Kedusha - Kavod vs. Protection" | Rabbi E. Feder | 2099s | 2013-12-18 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/YBTArchived/YBT-808894.mp3
  DELETE YBTArchived-433    | YBTArchived  | "Megilla 26b-Tashmish Kedusha-Kavod vs. Protection" | Rabbi E. Feder | 2099s | 2013-12-18 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/YBTArchived/YBTArchived-433.mp3

MATCH (same date)
  KEEP   YBT-1161463        | YBT          | "Sunday Shiur - חכם שמת, בית מדרשו בטל" | Rabbi Zev Cinamon | 2640s | 2026-01-04 | https://download.yutorah.org/2026/22624/1161463.MP3
  DELETE YBT-1169048        | YBT          | "Sunday Shiur - חכם שמת, בית מדרשו בטל" | Rabbi Zev Cinamon | 2640s | 2026-01-04 | https://download.yutorah.org/2026/22624/1169048.MP3

MATCH (same audio file URL)
  KEEP   YBT-804932         | YBT          | "Sanhedrin 76b-77a" | Rabbi Pesach Chait | 3053s | 2013-07-03 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_76b-77a_07_03_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3240   | YBTArchived  | "Sanhedrin 76b-77a" | Rabbi Pesach Chait | 3053s | 2013-07-03 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_76b-77a_07_03_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804956         | YBT          | "Sanhedrin 29a" | Rabbi Pesach Chait | 2290s | 2013-05-30 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_29a_05_30_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3246   | YBTArchived  | "Sanhedrin 29a" | Rabbi Pesach Chait | 2290s | 2013-05-30 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_29a_05_30_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804958         | YBT          | "Sanhedrin 29a" | Rabbi Pesach Chait | 3446s | 2013-05-29 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_29a_05_29_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3247   | YBTArchived  | "Sanhedrin 29a" | Rabbi Pesach Chait | 3446s | 2013-05-29 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_29a_05_29_13_Rabbi_P_Chait.mp3

MATCH (same audio file URL)
  KEEP   YBT-804984         | YBT          | "Sanhedrin 28a - Yad Rama" | Rabbi Pesach Chait | 1972s | 2013-04-25 | http://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_28a-Yad_Rama_04_25_13_Rabbi_P_Chait.mp3
  DELETE YBTArchived-3256   | YBTArchived  | "Sanhedrin 28a-Yad Rama" | Rabbi Pesach Chait | 1972s | 2013-04-25 | https://www.ybt.org/audio/2012-2013/rpchait/gemara/Sanhendrin_28a-Yad_Rama_04_25_13_Rabbi_P_Chait.mp3

MATCH (same date)
  KEEP   YBT-1171060        | YBT          | "Yevamos 29a Tosfos Ela" | Rabbi Pesach Chait | 3360s | 2026-03-19 | https://download.yutorah.org/2026/22624/1171060.MP3
  DELETE YBT-1174381        | YBT          | "Yevamos 29a Tosfos Ela" | Rabbi Pesach Chait | 3360s | 2026-03-19 | https://download.yutorah.org/2026/22624/1174381.MP3

MATCH (same date)
  KEEP   YBT-1171059        | YBT          | "Yevamos 29b Rashi" | Rabbi Pesach Chait | 3060s | 2026-03-18 | https://download.yutorah.org/2026/22624/1171059.MP3
  DELETE YBT-1174380        | YBT          | "Yevamos 29b Rashi" | Rabbi Pesach Chait | 3060s | 2026-03-18 | https://download.yutorah.org/2026/22624/1174380.MP3

MATCH (same date)
  KEEP   YBT-1171058        | YBT          | "Yevamos 29a Mamar" | Rabbi Pesach Chait | 3600s | 2026-03-16 | https://download.yutorah.org/2026/22624/1171058.MP3
  DELETE YBT-1174379        | YBT          | "Yevamos 29a Mamar" | Rabbi Pesach Chait | 3600s | 2026-03-16 | https://download.yutorah.org/2026/22624/1174379.MP3


==================================================
PART 2: 24 GROUPS EXCLUDED (looked like dupes by title/rabbi/duration but are NOT - kept as-is)
==================================================
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9303 | BN | Prayer (Set 2) | Rabbi Chait | dur=3600 | date=1993-02-03 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9303%20Prayer%20(no.1).mp3
BN-9304 | BN | Prayer (Set 2) | Rabbi Chait | dur=3600 | date=1993-02-10 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9304%20Prayer%20(no.2).mp3
BN-9305 | BN | Prayer (Set 2) | Rabbi Chait | dur=3600 | date=1993-02-17 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9305%20Prayer%20(no.3).mp3
BN-9306 | BN | Prayer (Set 2) | Rabbi Chait | dur=3600 | date=1993-02-24 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9306%20Prayer%20(no.4).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9316 | BN | Prayer (Set 3) | Rabbi Chait | dur=3600 | date=1993-03-03 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9316%20Prayer%20(no.5).mp3
BN-9317 | BN | Prayer (Set 3) | Rabbi Chait | dur=3600 | date=1993-03-10 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9317%20Prayer%20(no.6).mp3
BN-9320 | BN | Prayer (Set 3) | Rabbi Chait | dur=3600 | date=1993-03-31 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9320%20Prayer%20(no.7).mp3
BN-9321 | BN | Prayer (Set 3) | Rabbi Chait | dur=3600 | date=1993-04-14 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9321%20Prayer%20(no.8).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9318 | BN | Passover (Set 3) | Rabbi Mann | dur=3600 | date=1993-03-17 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Holidays/Pesach/BN-9318%20Passover%20(no.1).mp3
BN-9319 | BN | Passover (Set 3) | Rabbi Mann | dur=3600 | date=1993-03-24 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Holidays/Pesach/BN-9319%20Passover%20(no.2).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9328 | BN | Prayer (Set 4) | Rabbi Chait | dur=3600 | date=1993-04-28 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9328%20Prayer%20(no.9).mp3
BN-9329 | BN | Prayer (Set 4) | Rabbi Chait | dur=3600 | date=1993-05-05 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9329%20Prayer%20(no.10).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9330 | BN | Amidah (Set 4) | Rabbi Chait | dur=3600 | date=1993-05-12 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9330%20Amidah%20(no.1)%20(Prayer%20no.11).mp3
BN-9331 | BN | Amidah (Set 4) | Rabbi Chait | dur=3600 | date=1993-05-19 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9331%20Amidah%20(no.2)%20(Prayer%20no.12).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9332 | BN | Copper Snake (Set 4) | Rabbi Mann | dur=3600 | date=1993-06-02 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Chumash/(4)%20Bamidbar/Chukat/BN-9332%20Copper%20Snake%20(no.1).mp3
BN-9333 | BN | Copper Snake (Set 4) | Rabbi Mann | dur=3600 | date=1993-06-09 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Chumash/(4)%20Bamidbar/Chukat/BN-9333%20Copper%20Snake%20(no.2).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9340 | BN | Prayer (Set 5) | Rabbi Chait | dur=3600 | date=1993-06-16 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9340%20Prayer%20(no.13).mp3
BN-9342 | BN | Prayer (Set 5) | Rabbi Chait | dur=3600 | date=1993-07-14 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9342%20Prayer%20(no.14).mp3
BN-9343 | BN | Prayer (Set 5) | Rabbi Chait | dur=3600 | date=1993-07-21 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Discussion/Tefila/BN-9343%20Prayer%20(no.15).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9347 | BN | Concepts of Kosher (Set 6) | Rabbi Chait | dur=3600 | date=1993-08-11 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9347%20Concepts%20of%20Kosher%20(no.1).mp3
BN-9348 | BN | Concepts of Kosher (Set 6) | Rabbi Chait | dur=3600 | date=1993-08-18 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9348%20Concepts%20of%20Kosher%20(no.3).mp3
BN-9349 | BN | Concepts of Kosher (Set 6) | Rabbi Chait | dur=3600 | date=1993-08-25 | 
BN-9350 | BN | Concepts of Kosher (Set 6) | Rabbi Chait | dur=3600 | date=1993-09-01 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9350%20Concepts%20of%20Kosher%20(no.4).mp3
BN-9351 | BN | Concepts of Kosher (Set 6) | Rabbi Chait | dur=3600 | date=1993-09-08 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9351%20Concepts%20of%20Kosher%20(no.5).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9407 | BN | Talmud (Set 8) | Rabbi Chait | dur=3600 | date=1993-12-15 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9407%20Talmud%20(no.2).mp3
BN-9408 | BN | Talmud (Set 8) | Rabbi Chait | dur=3600 | date=1994-01-15 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9408%20Talmud%20(no.3).mp3
BN-9411 | BN | Talmud (Set 8) | Rabbi Chait | dur=3600 | date=1994-02-09 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9411%20Talmud%20(no.4).mp3
BN-9412 | BN | Talmud (Set 8) | Rabbi Chait | dur=3600 | date=1994-02-16 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9412%20Talmud%20(no.5).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9427 | BN | Talmud (Set 9) | Rabbi Chait | dur=3600 | date=1994-03-02 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9427%20Talmud%20(no.6).mp3
BN-9428 | BN | Talmud (Set 9) | Rabbi Chait | dur=3600 | date=1994-03-09 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9428%20Talmud%20(no.7).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9429 | BN | Megilath Esther (Set 9) | Rabbi Chait | dur=3600 | date=1994-03-16 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9429%20Megilath%20Esther%20(no.1).mp3
BN-9430 | BN | Megilath Esther (Set 9) | Rabbi Chait | dur=3600 | date=1994-04-06 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9430%20Megilath%20Esther%20(no.2).mp3
BN-9431 | BN | Megilath Esther (Set 9) | Rabbi Chait | dur=3600 | date=1994-04-13 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9431%20Megilath%20Esther%20(no.3).mp3
BN-9432 | BN | Megilath Esther (Set 9) | Rabbi Chait | dur=3600 | date=1994-04-20 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9432%20Megilath%20Esther%20(no.4).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9446 | BN | The Seven Laws (Set 10) | Rabbi Chait | dur=3600 | date=1994-08-10 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9446%20The%20Seven%20Laws%20of%20Noach%20(no.2).mp3
BN-9447 | BN | The Seven Laws (Set 10) | Rabbi Chait | dur=3600 | date=1994-08-17 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9447%20The%20Seven%20Laws%20of%20Noach%20(no.3).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9498 | BN | Dreams (Set 12) | Rabbi Chait | dur=3600 | date=1994-12-07 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9498%20Dreams%20(no.1).mp3
BN-9499 | BN | Dreams (Set 12) | Rabbi Chait | dur=3600 | date=1994-12-14 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9499%20Dreams%20(no.2).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9507 | BN | Seven Laws (Set 12) | Rabbi Chait | dur=3600 | date=1994-12-28 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9507%20The%20Seven%20Laws%20of%20Noach%20(no.9).mp3
BN-9508 | BN | Seven Laws (Set 12) | Rabbi Chait | dur=3600 | date=1995-01-04 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9508%20The%20Seven%20Laws%20of%20Noach%20(no.10).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9514 | BN | Seven Laws (Set 13) | Rabbi Chait | dur=3600 | date=1995-01-11 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9514%20The%20Seven%20Laws%20of%20Noach%20(no.11).mp3
BN-9515 | BN | Seven Laws (Set 13) | Rabbi Chait | dur=3600 | date=1995-01-18 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9515%20The%20Seven%20Laws%20of%20Noach%20(no.12).mp3
BN-9516 | BN | Seven Laws (Set 13) | Rabbi Chait | dur=3600 | date=1995-02-01 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9516%20The%20Seven%20Laws%20of%20Noach%20(no.13).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9548 | BN | Passover (Set 14) | Rabbi Chait | dur=3600 | date=1995-05-24 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9548%20Passover%20(no.1).mp3
BN-9549 | BN | Passover (Set 14) | Rabbi Chait | dur=3600 | date=1995-05-31 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9549%20Passover%20(no.2).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
BN-9564 | BN | Kaballah (Set 15) | Rabbi Chait | dur=3600 | date=1995-08-23 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9564%20Kabbalah%20(no.2).mp3
BN-9565 | BN | Kaballah (Set 15) | Rabbi Chait | dur=3600 | date=1995-08-30 | https://pub-f7e468cb523143d080b0a917b25420fd.r2.dev/Bnai%20Noach/BN-9565%20Kabbalah%20(no.3).mp3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-931394 | YBT | Q&A | Rabbi E. Feder | dur=5280 | date=2019-06-24 | http://ybt.org/students/2018-2019/refeder/misc/2019_06_24-Q&A-Rabbi_E_Feder.mp3
YBT-921872 | YBT | Q&A | Rabbi E. Feder | dur=5280 | date=2019-03-16 | http://ybt.org/students/2018-2019/refeder/misc/2019_03_16-Q&A-Rabbi_E_Feder.mp3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-806815 | YBT | Rambam Yud Gimel Yesodos | Rabbi Pesach Chait | dur=3180 | date=2007-04-24 | http://ybt.org/audio/2006-2007/rpchait/hashkafa/Rambam_Yud_Gimel_Yesodos_04_24_07_Rabbi_P_Chait.mp3
YBT-806823 | YBT | Rambam Yud Gimel Yesodos | Rabbi Pesach Chait | dur=3180 | date=2007-02-13 | http://ybt.org/audio/2006-2007/rpchait/hashkafa/Rambam_Yud_Gimel_Yesodos_02_13_07_Rabbi_P_Chait.mp3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-806819 | YBT | Rambam Yud Gimel Yesodos | Rabbi Pesach Chait | dur=3300 | date=2007-03-13 | http://ybt.org/audio/2006-2007/rpchait/hashkafa/Rambam_Yud_Gimel_Yesodos_03_13_07_Rabbi_P_Chait.mp3
YBT-806820 | YBT | Rambam Yud Gimel Yesodos | Rabbi Pesach Chait | dur=3300 | date=2007-02-27 | http://ybt.org/audio/2006-2007/rpchait/hashkafa/Rambam_Yud_Gimel_Yesodos_02_27_07_Rabbi_P_Chait.mp3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-1031229 | YBT | Mishlei 21:12 - How the Tzadik Helps the Rasha Succeed (Part 2) | Rabbi Matt Schneeweiss | dur=2760 | date=2021-12-15 | https://download.yutorah.org/2021/22624/1031229.MP3
YBT-1031228 | YBT | Mishlei 21:12 - How the Tzadik Helps the Rasha Succeed (Part 2) | Rabbi Matt Schneeweiss | dur=2760 | date=2021-12-14 | https://download.yutorah.org/2021/22624/1031228.MP3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-867250 | YBT | Shabbos 93b-94a Aina Tzricha Lgufa | Rabbi Henoch Bald | dur=2460 | date=2016-11-20 | http://ybt.org/audio/2016-2017/rhbald/Shabbos_93b-94a_Aina_Tzricha_Lgufa_11_20_16_Rabbi_H_Bald.MP3
YBT-866410 | YBT | Shabbos 93b-94a-Aina Tzricha Lgufa | Rabbi Henoch Bald | dur=2460 | date=2016-11-13 | http://ybt.org/audio/2016-2017/rhbald/Shabbos_93b-94a-Aina_Tzricha_Lgufa_11_13_16_Rabbi_H_Bald.MP3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-874264 | YBT | Zevachim 95b and 96a Griz Merika Ushtifa | Rabbi Henoch Bald | dur=3120 | date=2017-03-05 | http://ybt.org/audio/2016-2017/rhbald/2017_03_05-Zevachim_95b,_and_96a_Griz_Merika_Ushtifa-Rabbi_H_Bald.mp3
YBT-874263 | YBT | Zevachim 95b and 96a Griz Merika Ushtifa | Rabbi Henoch Bald | dur=3120 | date=2017-02-26 | http://ybt.org/audio/2016-2017/rhbald/2017_02_26-Zevachim_95b,_and_96a_Griz_Merika_Ushtifa-Rabbi_H_Bald.mp3
--- (dates disagree and audio URLs differ (likely recurring series))
YBT-806136 | YBT | Krias Shema - Berachos 2b - Rabeynu Yona | Rabbi Pesach Chait | dur=69 | date=2009-12-16 | http://www.ybt.org/audio/2009-2010/rpchait/gemara/Krias_Shema_Brachos_2b-Rabeynu_Yona_12_16_09_Rabbi_P_Chait.mp3
YBT-806229 | YBT | Krias Shema - Berachos 2b - Rabeynu Yona | Rabbi Pesach Chait | dur=69 | date=2009-12-14 | http://www.ybt.org/audio/2009-2010/rpchait/gemara/Krias_Shema_Brachos_2b-Rabeynu_Yona_12_14_09_Rabbi_P_Chait.mp3
