#!/usr/bin/env node
/**
 * Converts character data from gi.nanoka.cc into a Genshin Optimizer
 * custom character pack, which GO can import as custom characters.
 *
 * Usage:
 *   node tools/custom-characters/nanoka-to-go.mjs <input.json | input-dir>... [-o output.json] [--image-url <url>]
 *
 * Each input is a character JSON from gi.nanoka.cc (for example the response
 * for character 10000149), or a directory of such files. All characters are
 * written into a single pack. Without `-o`, the pack is printed to stdout.
 *
 * The pack always lists the file names of each character's images. With
 * `--image-url` set to the address of any one image on that site (for example
 * the address of an avatar icon, copied from the browser), the pack also gets
 * full image URLs: every name gets that address's folder and extension.
 * Image URLs can also be filled in later, in GO's custom character editor.
 *
 * Buffs (stat bonuses from passives and constellations) are not in the source
 * data. When `buffs/<character id>.json` exists next to this script, its
 * `buffs` are added to that character. Buffs can also be edited in GO.
 *
 * Only Node.js built-ins are used, so the script runs without `yarn install`.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACK_FORMAT = 'genshin-optimizer-custom-characters'
export const PACK_VERSION = 1

const weaponMap = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CATALYST: 'catalyst',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_BOW: 'bow',
  WEAPON_POLE: 'polearm',
}
const rarityMap = { QUALITY_ORANGE: 5, QUALITY_PURPLE: 4 }
const elementMap = {
  Fire: 'pyro',
  Water: 'hydro',
  Ice: 'cryo',
  Elec: 'electro',
  Electric: 'electro',
  Wind: 'anemo',
  Rock: 'geo',
  Grass: 'dendro',
}
const regions = [
  'mondstadt',
  'liyue',
  'inazuma',
  'sumeru',
  'fontaine',
  'natlan',
  'snezhnaya',
  'nodkrai',
]
/** Game "fight prop" names (lowercase, as nanoka writes them) to GO stat keys */
const propMap = {
  fight_prop_base_hp: 'hp',
  fight_prop_base_attack: 'atk',
  fight_prop_base_defense: 'def',
  fight_prop_hp_percent: 'hp_',
  fight_prop_attack_percent: 'atk_',
  fight_prop_defense_percent: 'def_',
  fight_prop_critical: 'critRate_',
  fight_prop_critical_hurt: 'critDMG_',
  fight_prop_element_mastery: 'eleMas',
  fight_prop_charge_efficiency: 'enerRech_',
  fight_prop_heal_add: 'heal_',
  fight_prop_physical_add_hurt: 'physical_dmg_',
  fight_prop_elec_add_hurt: 'electro_dmg_',
  fight_prop_rock_add_hurt: 'geo_dmg_',
  fight_prop_fire_add_hurt: 'pyro_dmg_',
  fight_prop_water_add_hurt: 'hydro_dmg_',
  fight_prop_ice_add_hurt: 'cryo_dmg_',
  fight_prop_wind_add_hurt: 'anemo_dmg_',
  fight_prop_grass_add_hurt: 'dendro_dmg_',
}
const curveTypeMap = {
  FIGHT_PROP_BASE_HP: 'hp',
  FIGHT_PROP_BASE_ATTACK: 'atk',
  FIGHT_PROP_BASE_DEFENSE: 'def',
}
const talentOrder = ['auto', 'skill', 'burst']

function fail(msg) {
  throw new Error(msg)
}

function toElement(raw) {
  if (!raw) return undefined
  const lower = String(raw).toLowerCase()
  if (Object.values(elementMap).includes(lower)) return lower
  return elementMap[raw]
}

function toRegion(raw) {
  const r = String(raw ?? '').toLowerCase()
  const region = regions.find((region) => r.includes(region))
  // GO writes this region in camelCase
  return region === 'nodkrai' ? 'nodKrai' : region
}

/** Game rich text to plain text: strips color/link tags, keeps line breaks. */
export function cleanText(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\{LINK#[^}]*\}/g, '')
    .replace(/\{\/LINK\}/g, '')
    .replace(/<color=[^>]*>/g, '')
    .replace(/<\/color>/g, '')
    .replace(/<\/?i>/g, '')
    .trim()
}

const paramRe = /\{param(\d+):([A-Z0-9]+)\}/g

/**
 * One talent (normal attack, skill or burst):
 * - `rows`: the lines shown in game, e.g. "Low/High Plunge DMG" with its params
 * - `params`: for each param, its value at talent levels 1..15
 */
function convertTalent(skill) {
  const levels = Object.values(skill.promote ?? {}).sort(
    (a, b) => a.level - b.level
  )
  if (!levels.length) fail(`Skill ${skill.name} has no levels`)
  const rows = []
  let maxParam = 0
  for (const line of levels[0].desc ?? []) {
    if (!line) continue
    const [label, template = ''] = line.split('|')
    const params = [...template.matchAll(paramRe)].map(([, n, format]) => {
      const index = Number(n) - 1
      maxParam = Math.max(maxParam, index + 1)
      return { index, format }
    })
    rows.push({ label: label.trim(), template, params })
  }
  const params = Array.from({ length: maxParam }, (_, i) =>
    levels.map((lvl) => lvl.param?.[i] ?? 0)
  )
  return {
    name: skill.name,
    description: cleanText(skill.desc),
    icon: levels[0].icon,
    rows,
    params,
  }
}

function trimParams(list) {
  const arr = [...(list ?? [])]
  while (arr.length && arr[arr.length - 1] === 0) arr.pop()
  return arr
}

export function convertNanokaCharacter(src, sourceId) {
  if (!src || typeof src !== 'object' || !src.stats_modifier)
    fail('Not a gi.nanoka.cc character JSON (missing stats_modifier)')
  const name = src.name || fail('Missing name')
  const ele = toElement(src.element)
  if (!ele) fail(`${name}: unknown element "${src.element}"`)
  const weaponType = weaponMap[src.weapon]
  if (!weaponType) fail(`${name}: unknown weapon type "${src.weapon}"`)
  const rarity = rarityMap[src.rarity]
  if (!rarity) fail(`${name}: unknown rarity "${src.rarity}"`)

  const sm = src.stats_modifier
  const bases = { hp: src.base_hp, atk: src.base_atk, def: src.base_def }
  const lvlCurves = (sm.prop_grow_curves ?? []).map(({ grow_curve, type }) => {
    const key = curveTypeMap[type] ?? fail(`${name}: unknown curve ${type}`)
    return { key, base: bases[key], curve: grow_curve }
  })

  // nanoka lists ascension phases 1..6; GO also stores phase 0 (all zero)
  const ascensionBonus = {}
  for (const [phase, props] of (sm.ascension ?? []).entries())
    for (const [prop, value] of Object.entries(props)) {
      const key = propMap[prop.toLowerCase()]
      if (!key) fail(`${name}: unknown ascension stat ${prop}`)
      ascensionBonus[key] ??= [0, 0, 0, 0, 0, 0, 0]
      ascensionBonus[key][phase + 1] = value
    }

  const skills = src.skills ?? []
  if (skills.length < 3)
    fail(`${name}: expected 3 talents, got ${skills.length}`)
  // The burst is the last talent; extra talents (e.g. alternate sprint) sit in between.
  const talentSkills = [skills[0], skills[1], skills[skills.length - 1]]
  const talents = Object.fromEntries(
    talentOrder.map((key, i) => [key, convertTalent(talentSkills[i])])
  )

  const passiveOf = (p) => ({
    name: p.name,
    description: cleanText(p.desc),
    icon: p.icon,
    unlockAscension: p.unlock ?? 0,
    params: trimParams(p.param_list),
  })
  const passives = (src.passives ?? []).map(passiveOf)
  const byUnlock = (n) => passives.filter((p) => p.unlockAscension === n)
  const constellations = (src.constellations ?? []).map((c) => ({
    name: c.name,
    description: cleanText(c.desc),
    icon: c.icon,
    params: trimParams(c.param_list),
  }))

  return {
    sourceId: sourceId ?? null,
    name,
    title: src.chara_info?.title || '',
    description: cleanText(src.desc),
    ele,
    weaponType,
    rarity,
    region: toRegion(src.chara_info?.region),
    birthday: {
      month: src.chara_info?.birth?.[0],
      day: src.chara_info?.birth?.[1],
    },
    lvlCurves,
    ascensionBonus,
    talents,
    passive1: byUnlock(1)[0],
    passive2: byUnlock(4)[0],
    passive3: byUnlock(0)[0],
    otherPassives: byUnlock(0).slice(1),
    constellations,
    imageNames: imageNamesOf(src, talentSkills),
  }
}

/** File names of a character's images, per GO image slot. */
function imageNamesOf(src, talentSkills) {
  const talentIcon = (skill) =>
    Object.values(skill.promote ?? {}).find((lvl) => lvl.icon)?.icon
  const names = {
    icon: src.icon,
    iconSide: src.icon?.replace('UI_AvatarIcon_', 'UI_AvatarIcon_Side_'),
    banner: src.chara_info?.namecard?.icon,
    // nanoka has no portrait card; the wish art is the closest
    card: src.icon?.replace('UI_AvatarIcon_', 'UI_Gacha_AvatarImg_'),
    skill: talentIcon(talentSkills[1]),
    burst: talentIcon(talentSkills[2]),
  }
  const passives = src.passives ?? []
  const byUnlock = (n) => passives.filter((p) => (p.unlock ?? 0) === n)
  names.passive1 = byUnlock(1)[0]?.icon
  names.passive2 = byUnlock(4)[0]?.icon
  names.passive3 = byUnlock(0)[0]?.icon
  names.passive = byUnlock(0)[1]?.icon // a 4th passive, if any
  for (const [i, c] of (src.constellations ?? []).slice(0, 6).entries())
    names[`constellation${i + 1}`] = c.icon
  return Object.fromEntries(
    Object.entries(names).filter(([, v]) => typeof v === 'string' && v)
  )
}

/** Same as GO's `customCharacterImagesFromExample`. */
export function imagesFromExample(imageNames, exampleUrl) {
  const m = exampleUrl
    .trim()
    .match(/^(https?:\/\/\S+\/)[^/?#]+?(\.[a-z0-9]+)?([?#].*)?$/i)
  if (!m) fail(`Not an image URL: ${exampleUrl}`)
  const [, folder, ext = '', query = ''] = m
  return Object.fromEntries(
    Object.entries(imageNames).map(([k, name]) => [
      k,
      `${folder}${name}${ext}${query}`,
    ])
  )
}

/** Hand-written buffs for a character, from `buffs/<id>.json`, if any. */
function buffPreset(sourceId) {
  if (!sourceId) return undefined
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    'buffs',
    `${sourceId}.json`
  )
  if (!existsSync(file)) return undefined
  const { buffs } = JSON.parse(readFileSync(file, 'utf8'))
  return Array.isArray(buffs) ? buffs : undefined
}

export function makePack(characters, source = 'gi.nanoka.cc') {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    source,
    exportedAt: new Date().toISOString(),
    characters,
  }
}

/** Files given directly must be character JSONs; files found in a directory may be skipped. */
function collectInputs(paths) {
  const files = []
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).sort())
        if (f.endsWith('.json'))
          files.push({ file: join(p, f), optional: true })
    } else files.push({ file: p, optional: false })
  }
  return files
}

function main(argv) {
  const args = [...argv]
  let out
  const o = args.indexOf('-o')
  if (o !== -1) {
    out = args[o + 1]
    args.splice(o, 2)
  }
  let imageUrl
  const u = args.indexOf('--image-url')
  if (u !== -1) {
    imageUrl = args[u + 1]
    args.splice(u, 2)
  }
  if (!args.length) {
    console.error(
      'Usage: node nanoka-to-go.mjs <input.json | input-dir>... [-o output.json] [--image-url <url>]'
    )
    process.exit(1)
  }
  const characters = []
  for (const { file, optional } of collectInputs(args)) {
    const id = file.match(/(\d{8})[^\\/]*\.json$/)?.[1]
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (optional && !data?.stats_modifier) {
      console.error(`Skipped ${file} (not a gi.nanoka.cc character JSON)`)
      continue
    }
    const char = convertNanokaCharacter(data, id ? Number(id) : null)
    if (imageUrl) char.images = imagesFromExample(char.imageNames, imageUrl)
    const buffs = buffPreset(char.sourceId)
    if (buffs) {
      char.buffs = buffs
      console.error(
        `  + ${buffs.length} buffs from buffs/${char.sourceId}.json`
      )
    }
    characters.push(char)
    console.error(`Converted ${char.name} (${file})`)
  }
  const json = `${JSON.stringify(makePack(characters), null, 2)}\n`
  if (out) {
    writeFileSync(out, json)
    console.error(`Wrote ${characters.length} character(s) to ${out}`)
  } else process.stdout.write(json)
}

if (process.argv[1]?.endsWith('nanoka-to-go.mjs')) main(process.argv.slice(2))
