import anastasyaPack from './anastasya-silverdawn.json'
import danicaPack from './danica-torrents.json'

/**
 * Custom characters and weapons that ship with GO, from custom character
 * packs (see `tools/custom-characters`). They are always available, without
 * importing anything; their images are in `gi/assets` and `gi/char-cards`.
 *
 * A definition saved in localStorage under the same key (edited in the
 * Custom Character / Custom Weapon editor) takes their place, and a pack
 * character imported before (same source id) keeps being used instead.
 */
export const builtinCustomCharacterEntries = [
  {
    key: 'Anastasya',
    template: 'Ganyu',
    data: anastasyaPack.characters[0] as unknown,
  },
  {
    key: 'Danica',
    template: 'Beidou',
    data: danicaPack.characters[0] as unknown,
  },
] as const

export const builtinCustomWeaponEntries = [
  {
    key: 'Silverdawn',
    template: 'AmosBow',
    data: anastasyaPack.weapons[0] as unknown,
  },
  {
    key: 'TorrentsOfSpring',
    template: 'WolfsGravestone',
    data: danicaPack.weapons[0] as unknown,
  },
] as const

export const builtinCustomCharacterKeys: readonly string[] =
  builtinCustomCharacterEntries.map(({ key }) => key)
export const builtinCustomWeaponKeys: readonly string[] =
  builtinCustomWeaponEntries.map(({ key }) => key)
