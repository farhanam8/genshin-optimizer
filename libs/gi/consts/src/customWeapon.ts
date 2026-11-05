import type { ElementKey } from './character'
import type {
  CustomCharacterBuffStat,
  CustomCharacterBuffTarget,
} from './customCharacter'
import {
  customCharacterBuffStats,
  customCharacterBuffTargets,
  customCharacterPackFormat,
  isCustomCharacterImageUrl,
} from './customCharacter'
import type { WeaponTypeKey } from './weapon'

/**
 * Custom weapons are imported from a custom character pack (its `weapons`,
 * see `tools/custom-characters`): their own base ATK and substat curves,
 * ascension bonus, passive texts and passive buffs per refinement.
 * `template` is an existing weapon of the same type whose images are used
 * where no image URL is set.
 *
 * Like custom characters, definitions live in localStorage and are read once
 * when this module is first evaluated, so changes need a page reload.
 */
export type CustomWeaponDef = {
  /** Weapon key used everywhere in GO, e.g. `CustomWeapon1` */
  key: string
  name: string
  template: string
  weaponType: WeaponTypeKey
  rarity: 1 | 2 | 3 | 4 | 5
  /** Weapon id on the source site, used to update a weapon on re-import */
  sourceId?: number
  /** Base ATK at level 1 and its growth curve */
  mainStat: { base: number; curve: string }
  subStat?: { type: CustomWeaponSubstat; base: number; curve: string }
  /** ATK added at ascension phases 0..6 */
  ascensionBonus: number[]
  passiveName: string
  /** Passive description at refinements 1..5 */
  passiveDescriptions: string[]
  buffs?: CustomWeaponBuff[]
  images?: CustomWeaponImages
  imageNames?: CustomWeaponImages
}

export const customWeaponSubstats = [
  'atk_',
  'critDMG_',
  'critRate_',
  'def_',
  'eleMas',
  'enerRech_',
  'hp_',
  'physical_dmg_',
] as const
export type CustomWeaponSubstat = (typeof customWeaponSubstats)[number]

export type CustomWeaponImages = { icon?: string; awakenIcon?: string }

/**
 * A stat bonus from a weapon passive, with its value at refinements 1..5
 * (fractions for percentage stats: 0.4 = 40%).
 */
export type CustomWeaponBuff = {
  stat: CustomCharacterBuffStat
  values: number[]
  /** `self`: the wielder; `team`: every party member; `others`: everyone but the wielder */
  target: CustomCharacterBuffTarget
  /** When set, the buff only applies while this toggle is on (or in `conditionState`) */
  condition?: string
  conditionState?: string
  eles?: ElementKey[]
  excludeEles?: boolean
}

export const customWeaponStorageKey = 'go_customWeapons'
export const customWeaponKeyPrefix = 'CustomWeapon'

const weaponTypes = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'] as const
const elements = [
  'anemo',
  'geo',
  'electro',
  'dendro',
  'hydro',
  'pyro',
  'cryo',
] as const
const curveRe = /^GROW_CURVE_(ATTACK|CRITICAL)_\d{3}$/

const isObj = (o: unknown): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o)
const isNum = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n)
const str = (s: unknown) => (typeof s === 'string' ? s : '')

function validateBuff(o: unknown): CustomWeaponBuff | undefined {
  if (!isObj(o)) return undefined
  const { stat, values, target, condition, conditionState, eles } = o
  if (!customCharacterBuffStats.includes(stat as CustomCharacterBuffStat))
    return undefined
  if (!Array.isArray(values) || values.length !== 5 || !values.every(isNum))
    return undefined
  if (!customCharacterBuffTargets.includes(target as CustomCharacterBuffTarget))
    return undefined
  const buff: CustomWeaponBuff = {
    stat: stat as CustomCharacterBuffStat,
    values: [...values],
    target: target as CustomCharacterBuffTarget,
  }
  if (typeof condition === 'string' && condition.trim()) {
    buff.condition = condition.trim().slice(0, 80)
    if (typeof conditionState === 'string' && conditionState.trim())
      buff.conditionState = conditionState.trim().slice(0, 80)
  }
  if (Array.isArray(eles)) {
    const valid = eles.filter((e): e is ElementKey =>
      elements.includes(e as (typeof elements)[number])
    )
    if (valid.length) {
      buff.eles = valid
      if (o['excludeEles'] === true) buff.excludeEles = true
    }
  }
  return buff
}

function validateImages(
  o: unknown,
  check: (s: string) => boolean
): CustomWeaponImages | undefined {
  if (!isObj(o)) return undefined
  const images: CustomWeaponImages = {}
  for (const k of ['icon', 'awakenIcon'] as const) {
    const v = o[k]
    if (typeof v === 'string' && v && check(v)) images[k] = v
  }
  return Object.keys(images).length ? images : undefined
}

/** Sanitized copy of a weapon definition, or `undefined` if invalid. */
export function validateCustomWeaponDef(
  obj: unknown
): CustomWeaponDef | undefined {
  if (!isObj(obj)) return undefined
  const { key, name, template, weaponType, rarity, mainStat, subStat } = obj
  const { ascensionBonus, passiveDescriptions, buffs } = obj
  if (typeof key !== 'string' || !/^CustomWeapon\d+$/.test(key))
    return undefined
  if (typeof template !== 'string' || !template) return undefined
  if (!weaponTypes.includes(weaponType as WeaponTypeKey)) return undefined
  if (![1, 2, 3, 4, 5].includes(rarity as number)) return undefined
  if (
    !isObj(mainStat) ||
    !isNum(mainStat['base']) ||
    !curveRe.test(str(mainStat['curve']))
  )
    return undefined
  if (
    !Array.isArray(ascensionBonus) ||
    ascensionBonus.length !== 7 ||
    !ascensionBonus.every(isNum)
  )
    return undefined
  const def: CustomWeaponDef = {
    key,
    name: typeof name === 'string' && name.trim() ? name.trim() : key,
    template,
    weaponType: weaponType as WeaponTypeKey,
    rarity: rarity as CustomWeaponDef['rarity'],
    sourceId: isNum(obj['sourceId']) ? obj['sourceId'] : undefined,
    mainStat: { base: mainStat['base'], curve: str(mainStat['curve']) },
    ascensionBonus: [...ascensionBonus],
    passiveName: str(obj['passiveName']),
    passiveDescriptions: Array.isArray(passiveDescriptions)
      ? passiveDescriptions.map(str).slice(0, 5)
      : [],
  }
  if (
    isObj(subStat) &&
    customWeaponSubstats.includes(subStat['type'] as CustomWeaponSubstat) &&
    isNum(subStat['base']) &&
    curveRe.test(str(subStat['curve']))
  )
    def.subStat = {
      type: subStat['type'] as CustomWeaponSubstat,
      base: subStat['base'],
      curve: str(subStat['curve']),
    }
  if (Array.isArray(buffs))
    def.buffs = buffs
      .map(validateBuff)
      .filter((b): b is CustomWeaponBuff => !!b)
  const images = validateImages(obj['images'], isCustomCharacterImageUrl)
  if (images) def.images = images
  const imageNames = validateImages(obj['imageNames'], (s) =>
    /^[\w.-]{1,100}$/.test(s)
  )
  if (imageNames) def.imageNames = imageNames
  return def
}

/** Reads the definitions from localStorage. Safe to call outside a browser. */
export function readCustomWeaponDefs(): CustomWeaponDef[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(customWeaponStorageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed.flatMap((entry) => {
      const def = validateCustomWeaponDef(entry)
      if (!def || seen.has(def.key)) return []
      seen.add(def.key)
      return [def]
    })
  } catch {
    return []
  }
}

/** Persists definitions to localStorage. The page must be reloaded afterwards. */
export function writeCustomWeaponDefs(defs: CustomWeaponDef[]) {
  localStorage.setItem(customWeaponStorageKey, JSON.stringify(defs))
}

/** The next unused `CustomWeaponN` key. */
export function nextCustomWeaponKey(defs: { key: string }[]): string {
  const used = new Set(defs.map(({ key }) => key))
  let i = 1
  while (used.has(`${customWeaponKeyPrefix}${i}`)) i++
  return `${customWeaponKeyPrefix}${i}`
}

/**
 * The weapons of a custom character pack, as definitions without a key or
 * template yet, or an error message key.
 */
export function parseCustomWeaponPack(
  json: string
):
  | { weapons: Omit<CustomWeaponDef, 'key' | 'template'>[] }
  | { error: string } {
  let pack: unknown
  try {
    pack = JSON.parse(json)
  } catch {
    return { error: 'invalidJson' }
  }
  if (!isObj(pack) || pack['format'] !== customCharacterPackFormat)
    return { error: 'notAPack' }
  if (!Array.isArray(pack['weapons']) || !pack['weapons'].length)
    return { error: 'noWeapons' }
  const weapons: Omit<CustomWeaponDef, 'key' | 'template'>[] = []
  for (const w of pack['weapons']) {
    if (!isObj(w)) return { error: 'invalidWeapon' }
    const def = validateCustomWeaponDef({
      ...w,
      key: `${customWeaponKeyPrefix}0`,
      template: '-',
    })
    if (!def) return { error: 'invalidWeapon' }
    const { key: _key, template: _template, ...rest } = def
    weapons.push(rest)
  }
  return { weapons }
}
