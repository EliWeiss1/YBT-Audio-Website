// Weekly-parsha lookup for the homepage pill and /parsha. Pure + server-safe:
// it only needs @hebcal/core, never the lecture data.
//
// "This week's parsha" is the next Shabbos reading on or after today, so it
// rolls over on Sunday (Saturday still shows that day's parsha). Diaspora
// schedule only. Weeks with no parsha (Yom Tov Shabbos) show the next one read.

import { HebrewCalendar, ParshaEvent } from '@hebcal/core'

export type ParshaRef = { name: string; nodeId: string }

/** Hebcal's transliteration → our Chumash tree node id + display name. */
const PARSHA_NODES: Record<string, ParshaRef> = {
  'Bereshit': { name: 'Bereishit', nodeId: 'bereishit-bereishit' },
  'Noach': { name: 'Noach', nodeId: 'bereishit-noach' },
  'Lech-Lecha': { name: 'Lech Lecha', nodeId: 'bereishit-lech-lecha' },
  'Vayera': { name: 'Vayeira', nodeId: 'bereishit-vayeira' },
  'Chayei Sara': { name: 'Chayei Sarah', nodeId: 'bereishit-chayei-sarah' },
  'Toldot': { name: 'Toldot', nodeId: 'bereishit-toldot' },
  'Vayetzei': { name: 'Vayeitzei', nodeId: 'bereishit-vayeitzei' },
  'Vayishlach': { name: 'Vayishlach', nodeId: 'bereishit-vayishlach' },
  'Vayeshev': { name: 'Vayeshev', nodeId: 'bereishit-vayeshev' },
  'Miketz': { name: 'Miketz', nodeId: 'bereishit-miketz' },
  'Vayigash': { name: 'Vayigash', nodeId: 'bereishit-vayigash' },
  'Vayechi': { name: 'Vayechi', nodeId: 'bereishit-vayechi' },
  'Shemot': { name: 'Shemot', nodeId: 'shemot-shemot' },
  'Vaera': { name: "Va'eira", nodeId: 'shemot-vaeira' },
  'Bo': { name: 'Bo', nodeId: 'shemot-bo' },
  'Beshalach': { name: 'Beshalach', nodeId: 'shemot-beshalach' },
  'Yitro': { name: 'Yitro', nodeId: 'shemot-yitro' },
  'Mishpatim': { name: 'Mishpatim', nodeId: 'shemot-mishpatim' },
  'Terumah': { name: 'Terumah', nodeId: 'shemot-terumah' },
  'Tetzaveh': { name: 'Tetzaveh', nodeId: 'shemot-tetzaveh' },
  'Ki Tisa': { name: 'Ki Tisa', nodeId: 'shemot-ki-tisa' },
  'Vayakhel': { name: 'Vayakhel', nodeId: 'shemot-vayakhel' },
  'Pekudei': { name: 'Pekudei', nodeId: 'shemot-pekudei' },
  'Vayikra': { name: 'Vayikra', nodeId: 'vayikra-vayikra' },
  'Tzav': { name: 'Tzav', nodeId: 'vayikra-tzav' },
  'Shmini': { name: 'Shemini', nodeId: 'vayikra-shemini' },
  'Tazria': { name: 'Tazria', nodeId: 'vayikra-tazria' },
  'Metzora': { name: 'Metzora', nodeId: 'vayikra-metzora' },
  'Achrei Mot': { name: 'Acharei Mot', nodeId: 'vayikra-acharei' },
  'Kedoshim': { name: 'Kedoshim', nodeId: 'vayikra-kedoshim' },
  'Emor': { name: 'Emor', nodeId: 'vayikra-emor' },
  'Behar': { name: 'Behar', nodeId: 'vayikra-behar' },
  'Bechukotai': { name: 'Bechukotai', nodeId: 'vayikra-bechukotai' },
  'Bamidbar': { name: 'Bamidbar', nodeId: 'bamidbar-bamidbar' },
  'Nasso': { name: 'Nasso', nodeId: 'bamidbar-nasso' },
  "Beha'alotcha": { name: "Beha'alotcha", nodeId: 'bamidbar-behaalotcha' },
  "Sh'lach": { name: 'Shelach', nodeId: 'bamidbar-shelach' },
  'Korach': { name: 'Korach', nodeId: 'bamidbar-korach' },
  'Chukat': { name: 'Chukat', nodeId: 'bamidbar-chukat' },
  'Balak': { name: 'Balak', nodeId: 'bamidbar-balak' },
  'Pinchas': { name: 'Pinchas', nodeId: 'bamidbar-pinchas' },
  'Matot': { name: 'Mattot', nodeId: 'bamidbar-mattot' },
  'Masei': { name: 'Masei', nodeId: 'bamidbar-masei' },
  'Devarim': { name: 'Devarim', nodeId: 'devarim-devarim' },
  'Vaetchanan': { name: "Va'etchanan", nodeId: 'devarim-vaetchanan' },
  'Eikev': { name: 'Eikev', nodeId: 'devarim-eikev' },
  "Re'eh": { name: "Re'eh", nodeId: 'devarim-reeh' },
  'Shoftim': { name: 'Shoftim', nodeId: 'devarim-shoftim' },
  'Ki Teitzei': { name: 'Ki Teitzei', nodeId: 'devarim-ki-teitzei' },
  'Ki Tavo': { name: 'Ki Tavo', nodeId: 'devarim-ki-tavo' },
  'Nitzavim': { name: 'Nitzavim', nodeId: 'devarim-nitzavim' },
  'Vayeilech': { name: 'Vayelech', nodeId: 'devarim-vayeilech' },
  "Ha'azinu": { name: "Ha'azinu", nodeId: 'devarim-haazinu' },
}

/** Calendar date in New York — the week turns over on Sunday there, not UTC. */
function todayInNewYork(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  return new Date(get('year'), get('month') - 1, get('day'))
}

/** The parsha (or the two parshiyot of a double week) for the week containing
 *  `now`'s next Shabbos. Always one or two entries, in reading order. */
export function getWeeklyParshiyot(now: Date = new Date()): ParshaRef[] {
  const start = todayInNewYork(now)
  const end = new Date(start)
  end.setDate(end.getDate() + 28)
  const events = HebrewCalendar.calendar({ start, end, sedrot: true, il: false })
  const sedra = events.find((e): e is ParshaEvent => e instanceof ParshaEvent)
  if (!sedra) return []
  return sedra.parsha
    .map(p => PARSHA_NODES[p])
    .filter((p): p is ParshaRef => !!p)
}

/** "Noach" or "Vayakhel–Pekudei". */
export function formatParshaTitle(parshiyot: ParshaRef[]): string {
  return parshiyot.map(p => p.name).join('–')
}

export const ALL_PARSHA_NODE_IDS = Object.values(PARSHA_NODES).map(p => p.nodeId)
