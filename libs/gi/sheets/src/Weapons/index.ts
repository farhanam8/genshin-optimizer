import type { WeaponKey, WeaponTypeKey } from '@genshin-optimizer/gi/consts'
import {
  allWeaponTypeKeys,
  customWeaponDefs,
} from '@genshin-optimizer/gi/consts'
import { getWeaponStat } from '@genshin-optimizer/gi/stats'
import { type Data, mergeData } from '@genshin-optimizer/gi/wr'
import bow from './Bow'
import catalyst from './Catalyst'
import claymore from './Claymore'
import { sheetForCustomWeapon } from './customWeaponSheet'
import polearm from './Polearm'
import sword from './Sword'
import type { WeaponSheet } from './WeaponSheet'

const WeaponData: Record<WeaponKey, WeaponSheet> = {
  ...sword,
  ...claymore,
  ...polearm,
  ...bow,
  ...catalyst,
} as const

// Custom weapons, registered before the display data below is built from this list.
for (const def of customWeaponDefs)
  (WeaponData as Record<string, WeaponSheet>)[def.key] =
    sheetForCustomWeapon(def)

// This is the weapon Data.displays merged together for each weapons.
export const displayDataMap = Object.fromEntries(
  allWeaponTypeKeys.map((k) => [
    k,
    mergeData(
      Object.entries(WeaponData)
        .filter(([wKey, _]) => getWeaponStat(wKey).weaponType === k)
        .map(([_, sheet]) => ({ display: sheet.data.display }))
    ),
  ])
) as Record<WeaponTypeKey, Data>

export function getWeaponSheet(wKey: WeaponKey) {
  return WeaponData[wKey]
}
