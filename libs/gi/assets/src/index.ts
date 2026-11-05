import type {
  ArtifactSetKey,
  ArtifactSlotKey,
  CharacterKey,
  GenderKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  charKeyToLocGenderedCharKey,
  customCharacterDefs,
  customWeaponDefs,
} from '@genshin-optimizer/gi/consts'
import { builtinCharacterImages, builtinWeaponImages } from './builtin'
import artifacts from './gen/artifacts'
import chars from './gen/chars'
import weapons from './gen/weapons'

// Custom characters use their own image URLs where set, and the images of
// their template character otherwise.
// Bundled images of built-in characters come between the two.
for (const def of customCharacterDefs) {
  const { key, template, images } = def
  const charAssets = chars as Record<string, Record<string, string>>
  const { card: _card, ...assetImages } = images ?? {}
  const sourceId = 'sourceId' in def ? def.sourceId : undefined
  charAssets[key] = {
    ...charAssets[template],
    ...(sourceId ? builtinCharacterImages[sourceId] : undefined),
    ...assetImages,
  }
}

// Custom weapons use their own image URLs where set, and their template's otherwise.
for (const { key, template, images, sourceId } of customWeaponDefs) {
  const weaponAssets = weapons as Record<string, Record<string, string>>
  weaponAssets[key] = {
    ...weaponAssets[template],
    ...(sourceId ? builtinWeaponImages[sourceId] : undefined),
    ...images,
  }
}

export * from './assets'

type characterAssetKey =
  | 'icon'
  | 'iconSide'
  | 'banner'
  | 'bar'
  | 'skill'
  | 'burst'
  | 'passive1'
  | 'passive2'
  | 'passive3'
  | 'lockedPassive'
  | 'constellation1'
  | 'constellation2'
  | 'constellation3'
  | 'constellation4'
  | 'constellation5'
  | 'constellation6'
  | 'sprint'
  | 'passive'
export function characterAsset(
  ck: CharacterKey,
  asset: characterAssetKey,
  gender: GenderKey = 'F'
) {
  switch (asset) {
    case 'icon':
    case 'iconSide':
      return chars[charKeyToLocGenderedCharKey(ck, gender)][asset] //gender specific
    default:
      return (chars[ck] as Record<characterAssetKey, string>)[asset]
  }
}
export function artifactAsset(ak: ArtifactSetKey, slotKey: ArtifactSlotKey) {
  if (
    ak === 'PrayersForDestiny' ||
    ak === 'PrayersForIllumination' ||
    ak === 'PrayersForWisdom' ||
    ak === 'PrayersToSpringtime'
  )
    return artifacts[ak].circlet
  else return artifacts[ak][slotKey]
}
export function artifactDefIcon(setKey: ArtifactSetKey) {
  return artifactAsset(setKey, 'flower') || artifactAsset(setKey, 'circlet')
}
export function weaponAsset(wk: WeaponKey, empowered = true) {
  return weapons[wk][empowered ? 'awakenIcon' : 'icon'] ?? weapons[wk]['icon']
}
