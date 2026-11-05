import type {
  ArtifactSetKey,
  CharacterKey,
  CharacterSheetKey,
  CustomCharacterDataDef,
  CustomCharacterTemplateDef,
  ElementKey,
  NonTravelerCharacterKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  allRegionKeys,
  charKeyToLocCharKey,
  customCharacterAscStatKeys,
  customCharacterDefs,
  isCustomCharacterDataDef,
} from '@genshin-optimizer/gi/consts'
import * as allStat_gen from './allStat_gen.json'
import type { AllStats, CharacterDataGen } from './executors/gen-stats/executor'

// Make sure these are type-only imports/exports.
// Importing the executor is quite costly.
export type {
  CharacterDataGen,
  WeaponDataGen,
} from './executors/gen-stats/executor'

const allStats = allStat_gen as AllStats

export { allStats }

type CharGrowCurveKey = CharacterDataGen['lvlCurves'][number]['curve']
type BaseStatKey = 'hp' | 'atk' | 'def'
const baseStatKeys = ['hp', 'atk', 'def'] as const
/** Standard ascension "special" stat progression, as a fraction of its max value */
const specialStatAscPattern = [0, 0, 0.25, 0.5, 0.5, 0.75, 1]
const refLevel = 90

function curveAt(curve: CharGrowCurveKey, level: number): number {
  return allStats.char.expCurve[curve][level]
}

/**
 * Base HP/ATK/DEF at level 90/90 and the ascension special stat at max
 * ascension, as shown in-game. Used to prefill the custom character editors.
 */
export function getCharRefStats(ck: CharacterKey) {
  return getRefStatsFromData(getCharStat(ck))
}

/** Same as `getCharRefStats`, from level curves and ascension stats. */
export function getRefStatsFromData({
  lvlCurves,
  ascensionBonus,
}: Pick<CharacterDataGen, 'lvlCurves' | 'ascensionBonus'>): {
  hp: number
  atk: number
  def: number
  ascStat?: string
  ascValue: number
} {
  const base = (stat: BaseStatKey) => {
    const lc = lvlCurves.find(({ key }) => key === stat)
    const fromCurve = lc ? lc.base * curveAt(lc.curve, refLevel) : 0
    return fromCurve + (ascensionBonus[stat]?.[6] ?? 0)
  }
  const special = Object.entries(ascensionBonus).find(
    ([key]) => !(baseStatKeys as readonly string[]).includes(key)
  )
  return {
    hp: base('hp'),
    atk: base('atk'),
    def: base('def'),
    ascStat: special?.[0],
    ascValue: special?.[1]?.[6] ?? 0,
  }
}

/**
 * Builds the stat data of a custom character from its template.
 * The template's level curve shape and the share of each stat coming from
 * ascension are kept, then scaled so that the level 90/90 value matches the
 * custom definition.
 */
function customCharacterData(
  def: CustomCharacterTemplateDef
): CharacterDataGen {
  const tmpl = (allStats.char.data as Record<string, CharacterDataGen>)[
    def.template
  ]
  const lvlCurves: CharacterDataGen['lvlCurves'] = []
  const ascensionBonus: CharacterDataGen['ascensionBonus'] = {}
  for (const stat of baseStatKeys) {
    const tmplCurve = tmpl.lvlCurves.find(({ key }) => key === stat)
    const tmplAsc = tmpl.ascensionBonus[stat] ?? [0, 0, 0, 0, 0, 0, 0]
    const tmplRef =
      (tmplCurve ? tmplCurve.base * curveAt(tmplCurve.curve, refLevel) : 0) +
      tmplAsc[6]
    const ascShare = tmplRef > 0 ? tmplAsc[6] / tmplRef : 0
    const target = def[stat]
    const ascMax = target * ascShare
    const curve = `GROW_CURVE_${stat === 'atk' ? 'ATTACK' : 'HP'}_S${
      def.rarity
    }` as CharGrowCurveKey
    lvlCurves.push({
      key: stat,
      base: (target - ascMax) / curveAt(curve, refLevel),
      curve,
    })
    ascensionBonus[stat] =
      tmplAsc[6] > 0
        ? tmplAsc.map((v) => (v / tmplAsc[6]) * ascMax)
        : specialStatAscPattern.map((f) => f * ascMax)
  }
  ascensionBonus[def.ascStat] = specialStatAscPattern.map(
    (f) => f * def.ascValue
  )
  return {
    key: def.key as CharacterDataGen['key'],
    ele: def.ele,
    region: tmpl.region,
    weaponType: def.weaponType,
    rarity: def.rarity,
    birthday: tmpl.birthday,
    lvlCurves,
    ascensionBonus,
    baseStats: tmpl.baseStats,
  }
}

/** Stat data of an imported (data kind) custom character, used as is. */
function customCharacterDataFromDef(
  def: CustomCharacterDataDef
): CharacterDataGen {
  const region = (allRegionKeys as readonly string[]).includes(def.region ?? '')
    ? (def.region as CharacterDataGen['region'])
    : undefined
  return {
    key: def.key as CharacterDataGen['key'],
    ele: def.ele,
    region,
    weaponType: def.weaponType,
    rarity: def.rarity,
    birthday: def.birthday ?? {},
    lvlCurves: def.lvlCurves.map((lc) => ({ ...lc })),
    ascensionBonus: Object.fromEntries(
      Object.entries(def.ascensionBonus).map(([k, v]) => [k, [...v]])
    ),
  }
}

/**
 * Rescales an imported character's level curves and ascension stats so that
 * its level 90/90 base stats and max ascension special stat match `target`,
 * keeping the shape of its curves.
 */
export function scaleCustomCharacterStats(
  def: Pick<CustomCharacterDataDef, 'lvlCurves' | 'ascensionBonus'>,
  target: {
    hp: number
    atk: number
    def: number
    ascStat: string
    ascValue: number
  }
): Pick<CustomCharacterDataDef, 'lvlCurves' | 'ascensionBonus'> {
  const ascensionBonus: Record<string, number[]> = {}
  const lvlCurves = def.lvlCurves.map((lc) => {
    const asc = def.ascensionBonus[lc.key] ?? [0, 0, 0, 0, 0, 0, 0]
    const current = lc.base * curveAt(lc.curve, refLevel) + asc[6]
    const factor = current > 0 ? target[lc.key] / current : 0
    ascensionBonus[lc.key] = asc.map((v) => v * factor)
    return { ...lc, base: lc.base * factor }
  })
  const special = Object.entries(def.ascensionBonus).find(
    ([key]) => !(baseStatKeys as readonly string[]).includes(key)
  )
  const pattern =
    special && special[1][6] > 0
      ? special[1].map((v) => v / special[1][6])
      : specialStatAscPattern
  if (
    (customCharacterAscStatKeys as readonly string[]).includes(target.ascStat)
  )
    ascensionBonus[target.ascStat] = pattern.map((f) => f * target.ascValue)
  return { lvlCurves, ascensionBonus }
}

// Register custom characters, so every lookup by key finds them.
for (const def of customCharacterDefs) {
  const charData = allStats.char.data as Record<string, CharacterDataGen>
  const skillParam = allStats.char.skillParam as Record<string, unknown>
  if (isCustomCharacterDataDef(def)) {
    charData[def.key] = customCharacterDataFromDef(def)
    skillParam[def.key] = {
      auto: def.talents.auto.params,
      skill: def.talents.skill.params,
      burst: def.talents.burst.params,
      passive1: [],
      passive2: [],
      passive3: [],
      constellation1: [],
      constellation2: [],
      constellation3: [],
      constellation4: [],
      constellation5: [],
      constellation6: [],
      upgradeableSkills: [],
    }
  } else {
    charData[def.key] = customCharacterData(def)
    skillParam[def.key] = skillParam[def.template]
  }
}

export function getCharEle(ck: CharacterSheetKey | CharacterKey): ElementKey {
  if (ck.startsWith('TravelerAnemo')) return 'anemo'
  else if (ck.startsWith('TravelerGeo')) return 'geo'
  else if (ck.startsWith('TravelerElectro')) return 'electro'
  else if (ck.startsWith('TravelerDendro')) return 'dendro'
  else if (ck.startsWith('TravelerHydro')) return 'hydro'
  else if (ck.startsWith('TravelerPyro')) return 'pyro'
  else if (ck.startsWith('TravelerCryo')) return 'cryo'
  else return allStats.char.data[ck as NonTravelerCharacterKey].ele!
}

// Omit the ele, should use getCharEle to get char element.
export function getCharStat(ck: CharacterKey): Omit<CharacterDataGen, 'ele'> {
  const locCharKey = charKeyToLocCharKey(ck)
  return allStats.char.data[locCharKey]
}

export function getCharParam(ck: CharacterSheetKey) {
  return allStats.char.skillParam[ck]
}

export function isCharMelee(ck: CharacterKey) {
  const charStat = getCharStat(ck)
  const weaponTypeKey = charStat.weaponType
  return (
    weaponTypeKey === 'sword' ||
    weaponTypeKey === 'polearm' ||
    weaponTypeKey === 'claymore'
  )
}

export function getArtSetStat(setKey: ArtifactSetKey) {
  return allStats.art.data[setKey]
}

export function getWeaponStat(weaponKey: WeaponKey) {
  return allStats.weapon.data[weaponKey]
}
export function weaponHasRefinement(weaponKey: WeaponKey) {
  return getWeaponStat(weaponKey).rarity > 2
}
