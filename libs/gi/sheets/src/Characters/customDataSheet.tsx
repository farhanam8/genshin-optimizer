import type {
  CharacterKey,
  CharacterSheetKey,
  CustomCharacterDataDef,
  CustomCharacterTalent,
  CustomCharacterTalentKey,
  CustomCharacterTalentRow,
} from '@genshin-optimizer/gi/consts'
import type { Data, NumNode } from '@genshin-optimizer/gi/wr'
import { constant, greaterEq, infoMut, input } from '@genshin-optimizer/gi/wr'
import type { IFieldDisplay } from '../fieldDisplay'
import { CharacterSheet } from './CharacterSheet'
import { charTemplates } from './charTemplates'
import { dataObjForCharacterSheet, dmgNode } from './dataUtil'
import type { TalentSheet, TalentSheetElementKey } from './ICharacterSheet.d'

/*
 * Character sheet of an imported (data kind) custom character.
 *
 * The imported data only has the talent rows shown in game ("1-Hit DMG",
 * "CD", ...) and their values per talent level, not how the game uses them.
 * So every percentage row whose label is a damage row (any Normal Attack
 * row, or a row named "... DMG") becomes a damage formula, scaling from the stat named in the row (ATK by default); every
 * other row is shown as a value for the current talent level. Passives and
 * constellations are shown as text, except constellations that increase a
 * talent level (usually C3/C5), which are applied.
 */

type Move =
  | 'normal'
  | 'charged'
  | 'plunging_collision'
  | 'plunging_impact'
  | 'skill'
  | 'burst'

const paramRe = /\{param(\d+):([A-Z0-9]+)\}/g
/** Rows with these words are special reactions; their formula is unknown. */
const reactionRe =
  /stellar|lunar|moonsign|bloom|burgeon|hyperbloom|swirl|electro-charged|overloaded|superconduct|shatter|burning/i
const notDamageRe = /increase|bonus|reduction|ratio|cost|interval|duration/i

const isPercent = (format: string) => /P$/.test(format)

/** The text between this param and the next one, e.g. " Max HP" or "×2". */
function textAfter(template: string, index: number): string {
  const re = new RegExp(`\\{param${index + 1}:[A-Z0-9]+\\}`)
  const match = re.exec(template)
  if (!match) return ''
  const rest = template.slice(match.index + match[0].length)
  const next = rest.search(/\{param|\//)
  return next === -1 ? rest : rest.slice(0, next)
}

function scalingStat(after: string): 'hp' | 'atk' | 'def' | 'eleMas' {
  if (/\bHP\b/i.test(after)) return 'hp'
  if (/\bDEF\b/i.test(after)) return 'def'
  if (/Elemental Mastery|\bEM\b/i.test(after)) return 'eleMas'
  return 'atk'
}

function moveOf(talent: CustomCharacterTalentKey, label: string): Move {
  if (talent === 'skill') return 'skill'
  if (talent === 'burst') return 'burst'
  if (/plunge/i.test(label))
    return /low|high/i.test(label) ? 'plunging_impact' : 'plunging_collision'
  if (/aimed|charged/i.test(label)) return 'charged'
  return 'normal'
}

function rowName(row: CustomCharacterTalentRow, part: number, after: string) {
  const hits = after.match(/[×x]\s*(\d+)/)?.[1]
  const parts =
    row.params.length > 1 ? ` (${part + 1}/${row.params.length})` : ''
  return `${row.label}${parts}${hits ? ` ×${hits}` : ''}`
}

/** Which talent a constellation description boosts by 3 levels, if any. */
function boostedTalent(
  description: string,
  talents: Record<CustomCharacterTalentKey, CustomCharacterTalent>
): CustomCharacterTalentKey | undefined {
  if (!/increases the level of/i.test(description)) return undefined
  if (talents.skill.name && description.includes(talents.skill.name))
    return 'skill'
  if (talents.burst.name && description.includes(talents.burst.name))
    return 'burst'
  if (/elemental skill/i.test(description)) return 'skill'
  if (/elemental burst/i.test(description)) return 'burst'
  if (/normal attack/i.test(description)) return 'auto'
  return undefined
}

export function dataSheetForCustomCharacter(
  def: CustomCharacterDataDef
): CharacterSheet {
  const key = def.key as CharacterKey
  const ct = charTemplates(key as CharacterSheetKey)
  const display: Record<string, Record<string, NumNode>> = {}
  const fields: Record<CustomCharacterTalentKey, IFieldDisplay[]> = {
    auto: [],
    skill: [],
    burst: [],
  }

  for (const tk of ['auto', 'skill', 'burst'] as const) {
    const talent = def.talents[tk]
    const levelIndex = input.total[`${tk}Index`]
    talent.rows.forEach((row, r) => {
      row.params.forEach(({ index, format }, part) => {
        const values = talent.params[index]
        if (!values?.length) return
        const after = textAfter(row.template, index)
        const name = rowName(row, part, after)
        // Normal Attack rows are damage ("Aimed Shot"); other talents name it ("... DMG")
        const isDamage =
          isPercent(format) &&
          (tk === 'auto' || /DMG/i.test(row.label)) &&
          !notDamageRe.test(row.label) &&
          !reactionRe.test(row.label)
        if (!isDamage) {
          const unit = isPercent(format)
            ? '%'
            : /^\s*s\b/.test(after)
              ? 's'
              : undefined
          fields[tk].push({
            text: name,
            value: (data) => {
              const lvl = data.get(levelIndex).value
              const v = values[Math.min(lvl, values.length - 1)] ?? 0
              return isPercent(format) ? v * 100 : v
            },
            fixed: isPercent(format) ? 1 : format === 'I' ? 0 : 1,
            unit,
          })
          return
        }
        const move = moveOf(tk, row.label)
        const additional: Data = {}
        if (
          tk === 'auto' &&
          (/fully[- ]charged/i.test(row.label) ||
            new RegExp(def.ele, 'i').test(row.label))
        )
          additional.hit = { ele: constant(def.ele) }
        if (move === 'plunging_collision')
          additional.hit = { ...additional.hit, reaction: constant('') }
        const node = infoMut(
          dmgNode(scalingStat(after), values, move, additional),
          {
            name,
          }
        )
        const section = tk === 'auto' ? move.split('_')[0] : tk
        display[section] = { ...display[section], [`${r}_${part}`]: node }
        fields[tk].push({ node })
      })
    })
  }

  const boosts: Partial<
    Record<'autoBoost' | 'skillBoost' | 'burstBoost', NumNode>
  > = {}
  const constellationFields: Record<number, IFieldDisplay[]> = {}
  def.constellations.forEach((c, i) => {
    const boosted = boostedTalent(c.description, def.talents)
    if (!boosted) return
    const node = greaterEq(input.constellation, i + 1, 3)
    boosts[`${boosted}Boost`] = node
    constellationFields[i + 1] = [{ node }]
  })

  const data = dataObjForCharacterSheet(key, display, { premod: boosts })

  const sheet: TalentSheet = {
    auto: ct.talentTem('auto', [{ fields: fields.auto }]),
    skill: ct.talentTem('skill', [{ fields: fields.skill }]),
    burst: ct.talentTem('burst', [{ fields: fields.burst }]),
  }
  if (def.passive1) sheet.passive1 = ct.talentTem('passive1')
  if (def.passive2) sheet.passive2 = ct.talentTem('passive2')
  if (def.passive3) sheet.passive3 = ct.talentTem('passive3')
  def.constellations.forEach((_, i) => {
    const ck = `constellation${i + 1}` as TalentSheetElementKey
    const cFields = constellationFields[i + 1]
    sheet[ck] = ct.talentTem(ck, cFields ? [{ fields: cFields }] : undefined)
  })
  return new CharacterSheet(sheet, data)
}
