import type { ElementKey } from './character'
import type { WeaponTypeKey } from './weapon'

/**
 * Custom characters are user-defined characters. There are two kinds:
 *
 * - `template` (default): reuses the kit (talents, passives, constellations,
 *   conditionals and formulas) of an existing "template" character, with its
 *   own name, element, weapon type, rarity and base stats.
 * - `data`: imported from a custom character pack (see
 *   `tools/custom-characters`). It has its own level curves, ascension stats
 *   and per-level talent multipliers; every talent row is shown as a formula.
 *   `template` is then only used for images.
 *
 * Definitions are stored in the browser's localStorage and are read once
 * when this module is first evaluated. Creating, editing or deleting a custom
 * character therefore requires a page reload to take effect.
 */
export type CustomCharacterDef =
  | CustomCharacterTemplateDef
  | CustomCharacterDataDef

type CustomCharacterBase = {
  /** Character key used everywhere in GO, e.g. `CustomChar1` */
  key: string
  /** Display name */
  name: string
  /** Existing (non-Traveler) character whose kit (template kind) or images (data kind) are reused */
  template: string
  ele: ElementKey
  weaponType: WeaponTypeKey
  rarity: 4 | 5
  /** Image URLs that replace the template's images */
  images?: CustomCharacterImages
}

/**
 * Image slots of a character in GO: `icon`/`iconSide` (avatar icons),
 * `banner` (name card, the background of character cards, team cards and the
 * character page), `card` (the large character art), and talent icons.
 */
export const customCharacterImageKeys = [
  'icon',
  'iconSide',
  'banner',
  'card',
  'skill',
  'burst',
  'passive1',
  'passive2',
  'passive3',
  'passive',
  'constellation1',
  'constellation2',
  'constellation3',
  'constellation4',
  'constellation5',
  'constellation6',
] as const
export type CustomCharacterImageKey = (typeof customCharacterImageKeys)[number]
export type CustomCharacterImages = Partial<
  Record<CustomCharacterImageKey, string>
>

/** Accepts web URLs and (reasonably small) embedded images. */
export function isCustomCharacterImageUrl(url: string): boolean {
  return (
    /^https?:\/\/\S+$/i.test(url) ||
    (/^data:image\/[a-z+.-]+;base64,/i.test(url) && url.length < 400_000)
  )
}

export type CustomCharacterTemplateDef = CustomCharacterBase & {
  kind?: 'template'
  /** Base HP/ATK/DEF at level 90 (including ascension bonus) */
  hp: number
  atk: number
  def: number
  /** Ascension "special" stat and its value at max ascension */
  ascStat: CustomCharacterAscStatKey
  ascValue: number
}

export const customCharacterTalentKeys = ['auto', 'skill', 'burst'] as const
export type CustomCharacterTalentKey =
  (typeof customCharacterTalentKeys)[number]

export type CustomCharacterTalentRow = {
  /** Row label as shown in game, e.g. "Low/High Plunge DMG" */
  label: string
  /** Value template as shown in game, e.g. "{param9:F1P}/{param10:F1P}" */
  template: string
  /** Params used by this row; `format` ends with `P` for percentages */
  params: { index: number; format: string }[]
}
/** Words that end a row label and are shared by all its values, e.g. "Plunge DMG" */
const sharedSuffixWordRe =
  /^(DMG|Plunge|Healing|Shield|Absorption|Regeneration|Bonus|Duration|CD|Cost)$/i

/**
 * The name of each value of a talent row. A row with several values names
 * them with slashes, which are split here:
 * "1-Hit Stellar-Conduct/Stellar Swirl DMG" gives "1-Hit Stellar-Conduct DMG"
 * and "1-Hit Stellar Swirl DMG"; "Low/High Plunge DMG" gives "Low Plunge DMG"
 * and "High Plunge DMG". Otherwise the values are numbered: "Label (1/2)".
 */
export function customCharacterRowLabels(
  row: Pick<CustomCharacterTalentRow, 'label' | 'params'>
): string[] {
  const n = row.params.length
  if (n < 2) return [row.label]
  const parts = row.label.split('/').map((p) => p.trim())
  if (parts.length === n && parts.every(Boolean)) {
    const firstWords = parts[0].split(/\s+/)
    const lastWords = parts[n - 1].split(/\s+/)
    let suffixAt = lastWords.findIndex(
      (w, i) => i > 0 && sharedSuffixWordRe.test(w)
    )
    if (suffixAt === -1) suffixAt = lastWords.length
    const prefix = firstWords.slice(0, -1).join(' ')
    const suffix = lastWords.slice(suffixAt).join(' ')
    const alternatives = [
      firstWords[firstWords.length - 1],
      ...parts.slice(1, -1),
      lastWords.slice(0, suffixAt).join(' '),
    ]
    return alternatives.map((alt) =>
      [prefix, alt, suffix].filter(Boolean).join(' ')
    )
  }
  return row.params.map((_, i) => `${row.label} (${i + 1}/${n})`)
}

export type CustomCharacterTalent = {
  name: string
  description: string
  rows: CustomCharacterTalentRow[]
  /** For each param, its value at talent levels 1..15 */
  params: number[][]
}
export type CustomCharacterText = { name: string; description: string }

/** Where a buff comes from; also when it unlocks (A1, A4, constellation level). */
export const customCharacterBuffSources = [
  'passive1',
  'passive2',
  'passive3',
  'passive',
  'constellation1',
  'constellation2',
  'constellation3',
  'constellation4',
  'constellation5',
  'constellation6',
] as const
export type CustomCharacterBuffSource =
  (typeof customCharacterBuffSources)[number]

const buffElements = [
  'anemo',
  'geo',
  'electro',
  'dendro',
  'hydro',
  'pyro',
  'cryo',
] as const

/** Stats a custom buff can increase (GO stat keys; `_` at the end = percentage). */
export const customCharacterBuffStats = [
  'atk_',
  'hp_',
  'def_',
  'atk',
  'hp',
  'def',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
  'heal_',
  'all_dmg_',
  ...buffElements.map((e) => `${e}_dmg_` as const),
  'physical_dmg_',
  'normal_dmg_',
  'charged_dmg_',
  'plunging_dmg_',
  'skill_dmg_',
  'burst_dmg_',
  'stellarconduct_dmg_',
  'stellarswirl_dmg_',
  'stellarconduct_baseDmg_',
  'stellarswirl_baseDmg_',
  'stellarconduct_specialDmg_',
  'stellarswirl_specialDmg_',
  'stellarconduct_critDMG_',
  'stellarswirl_critDMG_',
  ...buffElements.map((e) => `${e}_enemyRes_` as const),
] as const
export type CustomCharacterBuffStat = (typeof customCharacterBuffStats)[number]

/**
 * A stat bonus given by an imported custom character. Its value is
 * `value` (a fraction for percentage stats, e.g. 0.12 = 12%), or
 * `value` per `scaling.per` points of the character's own `scaling.stat`
 * (e.g. 0.007 per 100 ATK), capped at `max`.
 */
export type CustomCharacterBuff = {
  source: CustomCharacterBuffSource
  stat: CustomCharacterBuffStat
  value: number
  /**
   * `self`: only this character; `team`: every party member, including this
   * one; `others`: every party member except this one
   */
  target: CustomCharacterBuffTarget
  scaling?: { stat: 'atk' | 'hp' | 'def' | 'eleMas'; per: number }
  max?: number
  /** When set, the buff only applies while this toggle (shared by name) is on */
  condition?: string
  /**
   * With `condition`: the buff applies only while the toggle is in this
   * state. A toggle whose buffs name states becomes a choice between them.
   */
  conditionState?: string
  /** For team/others buffs: only party members of these elements (or all others, with `excludeEles`) */
  eles?: ElementKey[]
  excludeEles?: boolean
}

export const customCharacterBuffTargets = ['self', 'team', 'others'] as const
export type CustomCharacterBuffTarget =
  (typeof customCharacterBuffTargets)[number]

/**
 * A change to talent rows rather than to a stat. Rows are picked by
 * `match`, a case-insensitive regular expression tested on each value's name
 * (e.g. "Doom" or "^Triumph"), optionally only in one talent.
 * - `multiplier`: the matched values deal `value` times their DMG
 *   (e.g. 1.25 = "125% of the original DMG")
 * - `extraHit`: adds a copy of each matched value, dealing `value` times its
 *   DMG (e.g. 2.5), shown under `source` as "`name`: <row name>", with
 *   `bonuses` applied to that hit only
 */
export type CustomCharacterRowEffect = {
  source: CustomCharacterBuffSource
  kind: 'multiplier' | 'extraHit'
  match: string
  talent?: CustomCharacterTalentKey
  value: number
  name?: string
  bonuses?: { stat: CustomCharacterBuffStat; value: number }[]
  condition?: string
  conditionState?: string
}

function cleanCondition(o: Record<string, unknown>) {
  const { condition, conditionState } = o
  if (typeof condition !== 'string' || !condition.trim()) return {}
  return {
    condition: condition.trim().slice(0, 80),
    ...(typeof conditionState === 'string' && conditionState.trim()
      ? { conditionState: conditionState.trim().slice(0, 80) }
      : {}),
  }
}

/** Sanitized copy of a row effect, or `undefined` if invalid. */
export function validateCustomCharacterRowEffect(
  o: unknown
): CustomCharacterRowEffect | undefined {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return undefined
  const r = o as Record<string, unknown>
  const { source, kind, match, talent, value, name, bonuses } = r
  if (!customCharacterBuffSources.includes(source as CustomCharacterBuffSource))
    return undefined
  if (kind !== 'multiplier' && kind !== 'extraHit') return undefined
  if (typeof match !== 'string' || !match.trim() || match.length > 200)
    return undefined
  try {
    new RegExp(match, 'i')
  } catch {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return undefined
  const effect: CustomCharacterRowEffect = {
    source: source as CustomCharacterBuffSource,
    kind,
    match,
    value,
    ...cleanCondition(r),
  }
  if (customCharacterTalentKeys.includes(talent as CustomCharacterTalentKey))
    effect.talent = talent as CustomCharacterTalentKey
  if (typeof name === 'string' && name.trim())
    effect.name = name.trim().slice(0, 80)
  if (Array.isArray(bonuses)) {
    const valid = bonuses.flatMap((b) => {
      if (typeof b !== 'object' || b === null) return []
      const { stat, value: v } = b as Record<string, unknown>
      return customCharacterBuffStats.includes(
        stat as CustomCharacterBuffStat
      ) &&
        typeof v === 'number' &&
        Number.isFinite(v)
        ? [{ stat: stat as CustomCharacterBuffStat, value: v }]
        : []
    })
    if (valid.length) effect.bonuses = valid
  }
  return effect
}

/** Sanitized copy of a buff, or `undefined` if invalid. */
export function validateCustomCharacterBuff(
  o: unknown
): CustomCharacterBuff | undefined {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return undefined
  const b = o as Record<string, unknown>
  const { source, stat, value, target, scaling, max, eles } = b
  if (!customCharacterBuffSources.includes(source as CustomCharacterBuffSource))
    return undefined
  if (!customCharacterBuffStats.includes(stat as CustomCharacterBuffStat))
    return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (!customCharacterBuffTargets.includes(target as CustomCharacterBuffTarget))
    return undefined
  const buff: CustomCharacterBuff = {
    source: source as CustomCharacterBuffSource,
    stat: stat as CustomCharacterBuffStat,
    value,
    target: target as CustomCharacterBuffTarget,
    ...cleanCondition(b),
  }
  if (typeof scaling === 'object' && scaling !== null) {
    const { stat: sStat, per } = scaling as Record<string, unknown>
    if (
      (sStat === 'atk' ||
        sStat === 'hp' ||
        sStat === 'def' ||
        sStat === 'eleMas') &&
      typeof per === 'number' &&
      Number.isFinite(per) &&
      per > 0
    )
      buff.scaling = { stat: sStat, per }
  }
  if (typeof max === 'number' && Number.isFinite(max)) buff.max = max
  if (Array.isArray(eles)) {
    const valid = eles.filter((e): e is ElementKey =>
      buffElements.includes(e as (typeof buffElements)[number])
    )
    if (valid.length) {
      buff.eles = valid
      if (b['excludeEles'] === true) buff.excludeEles = true
    }
  }
  return buff
}

export const customCharacterGrowCurves = [
  'GROW_CURVE_HP_S4',
  'GROW_CURVE_ATTACK_S4',
  'GROW_CURVE_HP_S5',
  'GROW_CURVE_ATTACK_S5',
] as const
export type CustomCharacterGrowCurve =
  (typeof customCharacterGrowCurves)[number]

export type CustomCharacterDataDef = CustomCharacterBase & {
  kind: 'data'
  /** Character id on the source site, used to update a character on re-import */
  sourceId?: number
  region?: string
  title?: string
  birthday?: { month?: number; day?: number }
  lvlCurves: {
    key: 'hp' | 'atk' | 'def'
    base: number
    curve: CustomCharacterGrowCurve
  }[]
  /** Stat bonus at ascension phases 0..6 */
  ascensionBonus: Record<string, number[]>
  talents: Record<CustomCharacterTalentKey, CustomCharacterTalent>
  passive1?: CustomCharacterText
  passive2?: CustomCharacterText
  passive3?: CustomCharacterText
  /** Passives beyond the three standard ones; the first is shown in GO */
  otherPassives?: CustomCharacterText[]
  /** Stat bonuses from passives and constellations */
  buffs?: CustomCharacterBuff[]
  /** Changes to talent rows from passives and constellations */
  rowEffects?: CustomCharacterRowEffect[]
  constellations: CustomCharacterText[]
  /**
   * File names of the source site's images (without extension), per slot.
   * With the URL of one of them, the URLs of all can be filled in.
   */
  imageNames?: Partial<Record<CustomCharacterImageKey, string>>
}

export function isCustomCharacterDataDef(
  def: CustomCharacterDef
): def is CustomCharacterDataDef {
  return def.kind === 'data'
}

export const customCharacterStorageKey = 'go_customCharacters'
export const customCharacterKeyPrefix = 'CustomChar'

export const customCharacterAscStatKeys = [
  'hp_',
  'atk_',
  'def_',
  'eleMas',
  'enerRech_',
  'critRate_',
  'critDMG_',
  'heal_',
  'physical_dmg_',
  'anemo_dmg_',
  'geo_dmg_',
  'electro_dmg_',
  'hydro_dmg_',
  'pyro_dmg_',
  'cryo_dmg_',
  'dendro_dmg_',
] as const
export type CustomCharacterAscStatKey =
  (typeof customCharacterAscStatKeys)[number]

const customElements = [
  'anemo',
  'geo',
  'electro',
  'dendro',
  'hydro',
  'pyro',
  'cryo',
] as const
const customWeaponTypes = [
  'sword',
  'claymore',
  'polearm',
  'bow',
  'catalyst',
] as const

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

const isObj = (o: unknown): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o)
const isNumArr = (a: unknown): a is number[] =>
  Array.isArray(a) &&
  a.every((n) => typeof n === 'number' && Number.isFinite(n))
const str = (s: unknown) => (typeof s === 'string' ? s : '')

function validateBase(o: Record<string, unknown>) {
  const { key, name, template, ele, weaponType, rarity } = o
  if (typeof key !== 'string' || !/^CustomChar\d+$/.test(key)) return undefined
  if (typeof template !== 'string' || !template) return undefined
  if (!customElements.includes(ele as ElementKey)) return undefined
  if (!customWeaponTypes.includes(weaponType as WeaponTypeKey)) return undefined
  if (rarity !== 4 && rarity !== 5) return undefined
  const images = validateImageMap(o['images'], isCustomCharacterImageUrl)
  return {
    key,
    name: typeof name === 'string' && name.trim() ? name.trim() : key,
    template,
    ele: ele as ElementKey,
    weaponType: weaponType as WeaponTypeKey,
    rarity: rarity as 4 | 5,
    ...(images ? { images } : {}),
  }
}

/** Keeps the known image slots whose value passes `check`. */
function validateImageMap(
  o: unknown,
  check: (value: string) => boolean
): Partial<Record<CustomCharacterImageKey, string>> | undefined {
  if (!isObj(o)) return undefined
  const entries = customCharacterImageKeys.flatMap((k) => {
    const v = o[k]
    return typeof v === 'string' && v && check(v) ? [[k, v] as const] : []
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

/** File names only: letters, digits and a few separators. */
const isImageName = (name: string) => /^[\w.-]{1,100}$/.test(name)

/**
 * Builds image URLs from a character's source image names and the URL of any
 * one image of that site, e.g. `https://example.com/ui/UI_AvatarIcon_X.webp`:
 * every name gets that URL's folder and extension.
 */
export function customCharacterImagesFromExample<K extends string>(
  imageNames: Partial<Record<K, string>>,
  exampleUrl: string
): Partial<Record<K, string>> | undefined {
  const m = exampleUrl
    .trim()
    .match(/^(https?:\/\/\S+\/)[^/?#]+?(\.[a-z0-9]+)?([?#].*)?$/i)
  if (!m) return undefined
  const [, folder, ext = '', query = ''] = m
  return Object.fromEntries(
    Object.entries(imageNames).map(([k, name]) => [
      k,
      `${folder}${name}${ext}${query}`,
    ])
  ) as Partial<Record<K, string>>
}

function validateText(o: unknown): CustomCharacterText | undefined {
  if (!isObj(o)) return undefined
  return { name: str(o['name']), description: str(o['description']) }
}

function validateTalent(o: unknown): CustomCharacterTalent | undefined {
  if (!isObj(o)) return undefined
  const { params, rows } = o
  if (!Array.isArray(params) || !params.every(isNumArr)) return undefined
  if (!Array.isArray(rows)) return undefined
  const validRows: CustomCharacterTalentRow[] = []
  for (const row of rows) {
    if (!isObj(row) || !Array.isArray(row['params'])) return undefined
    const rowParams: CustomCharacterTalentRow['params'] = []
    for (const p of row['params']) {
      if (!isObj(p)) return undefined
      const { index, format } = p
      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= params.length
      )
        return undefined
      rowParams.push({ index, format: str(format) })
    }
    validRows.push({
      label: str(row['label']),
      template: str(row['template']),
      params: rowParams,
    })
  }
  return {
    name: str(o['name']),
    description: str(o['description']),
    rows: validRows,
    params: params.map((p) => [...p]),
  }
}

const dataStatKeys: readonly string[] = [
  'hp',
  'atk',
  'def',
  ...customCharacterAscStatKeys,
]

function validateDataDef(
  o: Record<string, unknown>
): CustomCharacterDataDef | undefined {
  const base = validateBase(o)
  if (!base) return undefined
  const { lvlCurves, ascensionBonus, talents, constellations } = o
  if (!Array.isArray(lvlCurves)) return undefined
  const curves: CustomCharacterDataDef['lvlCurves'] = []
  for (const lc of lvlCurves) {
    if (!isObj(lc)) return undefined
    const { key, base: b, curve } = lc
    if (key !== 'hp' && key !== 'atk' && key !== 'def') return undefined
    if (!isFiniteNonNeg(b)) return undefined
    if (!customCharacterGrowCurves.includes(curve as CustomCharacterGrowCurve))
      return undefined
    curves.push({ key, base: b, curve: curve as CustomCharacterGrowCurve })
  }
  if (!isObj(ascensionBonus)) return undefined
  const asc: Record<string, number[]> = {}
  for (const [stat, values] of Object.entries(ascensionBonus)) {
    if (
      !dataStatKeys.includes(stat) ||
      !isNumArr(values) ||
      values.length !== 7
    )
      return undefined
    asc[stat] = [...values]
  }
  if (!isObj(talents)) return undefined
  const validTalents = {} as CustomCharacterDataDef['talents']
  for (const tk of customCharacterTalentKeys) {
    const talent = validateTalent(talents[tk])
    if (!talent) return undefined
    validTalents[tk] = talent
  }
  const birthday = isObj(o['birthday']) ? o['birthday'] : {}
  return {
    ...base,
    kind: 'data',
    sourceId: typeof o['sourceId'] === 'number' ? o['sourceId'] : undefined,
    region: str(o['region']) || undefined,
    title: str(o['title']) || undefined,
    birthday: {
      month:
        typeof birthday['month'] === 'number' ? birthday['month'] : undefined,
      day: typeof birthday['day'] === 'number' ? birthday['day'] : undefined,
    },
    lvlCurves: curves,
    ascensionBonus: asc,
    talents: validTalents,
    passive1: validateText(o['passive1']),
    passive2: validateText(o['passive2']),
    passive3: validateText(o['passive3']),
    imageNames: validateImageMap(o['imageNames'], isImageName),
    buffs: Array.isArray(o['buffs'])
      ? o['buffs']
          .map(validateCustomCharacterBuff)
          .filter((b): b is CustomCharacterBuff => !!b)
      : undefined,
    rowEffects: Array.isArray(o['rowEffects'])
      ? o['rowEffects']
          .map(validateCustomCharacterRowEffect)
          .filter((r): r is CustomCharacterRowEffect => !!r)
      : undefined,
    otherPassives: Array.isArray(o['otherPassives'])
      ? o['otherPassives'].map(validateText).filter((c) => !!c)
      : undefined,
    constellations: Array.isArray(constellations)
      ? constellations
          .map(validateText)
          .filter((c) => !!c)
          .slice(0, 6)
      : [],
  }
}

/** Returns a sanitized copy of `obj`, or `undefined` if it is not a valid definition. */
export function validateCustomCharacterDef(
  obj: unknown
): CustomCharacterDef | undefined {
  if (!isObj(obj)) return undefined
  if (obj['kind'] === 'data') return validateDataDef(obj)
  const base = validateBase(obj)
  if (!base) return undefined
  const { hp, atk, def, ascStat, ascValue } = obj
  if (!isFiniteNonNeg(hp) || !isFiniteNonNeg(atk) || !isFiniteNonNeg(def))
    return undefined
  if (
    !customCharacterAscStatKeys.includes(ascStat as CustomCharacterAscStatKey)
  )
    return undefined
  if (!isFiniteNonNeg(ascValue)) return undefined
  return {
    ...base,
    hp,
    atk,
    def,
    ascStat: ascStat as CustomCharacterAscStatKey,
    ascValue,
  }
}

export const customCharacterPackFormat = 'genshin-optimizer-custom-characters'

/**
 * Reads a custom character pack (as written by
 * `tools/custom-characters/nanoka-to-go.mjs`). Returns its characters as data
 * definitions without a key or template yet, or an error message.
 */
export function parseCustomCharacterPack(
  json: string
):
  | { characters: Omit<CustomCharacterDataDef, 'key' | 'template'>[] }
  | { error: string } {
  let pack: unknown
  try {
    pack = JSON.parse(json)
  } catch {
    return { error: 'invalidJson' }
  }
  if (!isObj(pack) || pack['format'] !== customCharacterPackFormat)
    return { error: 'notAPack' }
  if (!Array.isArray(pack['characters']) || !pack['characters'].length)
    return {
      error: Array.isArray(pack['weapons']) ? 'noCharacters' : 'notAPack',
    }
  const characters: Omit<CustomCharacterDataDef, 'key' | 'template'>[] = []
  for (const char of pack['characters']) {
    if (!isObj(char)) return { error: 'invalidCharacter' }
    const def = validateDataDef({
      ...char,
      kind: 'data',
      key: `${customCharacterKeyPrefix}0`,
      template: '-',
    })
    if (!def) return { error: 'invalidCharacter' }
    const { key: _key, template: _template, ...rest } = def
    characters.push(rest)
  }
  return { characters }
}

/** Reads the raw definitions from localStorage. Safe to call outside a browser. */
export function readCustomCharacterDefs(): CustomCharacterDef[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(customCharacterStorageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const defs: CustomCharacterDef[] = []
    for (const entry of parsed) {
      const def = validateCustomCharacterDef(entry)
      if (!def || seen.has(def.key)) continue
      seen.add(def.key)
      defs.push(def)
    }
    return defs
  } catch {
    return []
  }
}

/** Persists definitions to localStorage. The page must be reloaded afterwards. */
export function writeCustomCharacterDefs(defs: CustomCharacterDef[]) {
  localStorage.setItem(customCharacterStorageKey, JSON.stringify(defs))
}

/** The next unused `CustomCharN` key. */
export function nextCustomCharacterKey(defs: CustomCharacterDef[]): string {
  const used = new Set(defs.map(({ key }) => key))
  let i = 1
  while (used.has(`${customCharacterKeyPrefix}${i}`)) i++
  return `${customCharacterKeyPrefix}${i}`
}
