import type { ElementKey } from './character'
import type { WeaponTypeKey } from './weapon'

/**
 * Custom characters are user-defined characters that reuse the kit
 * (talents, passives, constellations, conditionals and formulas) of an
 * existing "template" character, but with their own name, element, weapon
 * type, rarity and base stats.
 *
 * Definitions are stored in the browser's localStorage and are read once
 * when this module is first evaluated. Creating, editing or deleting a custom
 * character therefore requires a page reload to take effect.
 */
export type CustomCharacterDef = {
  /** Character key used everywhere in GO, e.g. `CustomChar1` */
  key: string
  /** Display name */
  name: string
  /** Existing (non-Traveler) character whose kit is reused */
  template: string
  ele: ElementKey
  weaponType: WeaponTypeKey
  rarity: 4 | 5
  /** Base HP/ATK/DEF at level 90 (including ascension bonus) */
  hp: number
  atk: number
  def: number
  /** Ascension "special" stat and its value at max ascension */
  ascStat: CustomCharacterAscStatKey
  ascValue: number
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

/** Returns a sanitized copy of `obj`, or `undefined` if it is not a valid definition. */
export function validateCustomCharacterDef(
  obj: unknown
): CustomCharacterDef | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined
  const o = obj as Record<string, unknown>
  const { key, name, template, ele, weaponType, rarity, hp, atk, def } = o
  const { ascStat, ascValue } = o
  if (typeof key !== 'string' || !/^CustomChar\d+$/.test(key)) return undefined
  if (typeof template !== 'string' || !template) return undefined
  if (!customElements.includes(ele as ElementKey)) return undefined
  if (!customWeaponTypes.includes(weaponType as WeaponTypeKey)) return undefined
  if (rarity !== 4 && rarity !== 5) return undefined
  if (!isFiniteNonNeg(hp) || !isFiniteNonNeg(atk) || !isFiniteNonNeg(def))
    return undefined
  if (
    !customCharacterAscStatKeys.includes(ascStat as CustomCharacterAscStatKey)
  )
    return undefined
  if (!isFiniteNonNeg(ascValue)) return undefined
  return {
    key,
    name: typeof name === 'string' && name.trim() ? name.trim() : key,
    template,
    ele: ele as ElementKey,
    weaponType: weaponType as WeaponTypeKey,
    rarity,
    hp,
    atk,
    def,
    ascStat: ascStat as CustomCharacterAscStatKey,
    ascValue,
  }
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
