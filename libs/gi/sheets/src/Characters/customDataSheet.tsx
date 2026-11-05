import type {
  CharacterKey,
  CharacterSheetKey,
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterDataDef,
  CustomCharacterTalent,
  CustomCharacterTalentKey,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import { customCharacterRowLabels } from '@genshin-optimizer/gi/consts'
import type { Data, NumNode } from '@genshin-optimizer/gi/wr'
import {
  constant,
  equal,
  greaterEq,
  infoMut,
  input,
  min,
  percent,
  prod,
  sum,
  target,
  unequal,
} from '@genshin-optimizer/gi/wr'
import type { IFieldDisplay } from '../fieldDisplay'
import { cond } from '../SheetUtil'
import type { DocumentSection } from '../sheet'
import { CharacterSheet } from './CharacterSheet'
import type { ICharacterTemplate } from './charTemplates'
import { charTemplates } from './charTemplates'
import {
  dataObjForCharacterSheet,
  dmgNode,
  stellarTalentDmgNode,
} from './dataUtil'
import type { TalentSheet, TalentSheetElementKey } from './ICharacterSheet.d'

/*
 * Character sheet of an imported (data kind) custom character.
 *
 * The imported data only has the talent rows shown in game ("1-Hit DMG",
 * "CD", ...) and their values per talent level, not how the game uses them.
 * A row with several values ("Stellar-Conduct/Stellar Swirl DMG") is split
 * into one entry per value. Every percentage value named as damage (any
 * Normal Attack value, or one named "... DMG") becomes a damage formula,
 * scaling from the stat named in the row (ATK by default); Stellar-Conduct
 * and Stellar Swirl damage use GO's Stellar reaction formulas. Every other
 * value is shown for the current talent level. Passives and constellations
 * are shown as text, except constellations that increase a talent level
 * (usually C3/C5), which are applied.
 */

type Move =
  | 'normal'
  | 'charged'
  | 'plunging_collision'
  | 'plunging_impact'
  | 'skill'
  | 'burst'

/** Other special reactions; GO has no talent formula for these. */
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

/** Stellar Glimmer reactions, and the element variant this character triggers. */
function stellarOf(
  name: string,
  ele: ElementKey
):
  | { variant: 'stellarconduct'; eleVariant: 'electro' | 'cryo' }
  | { variant: 'stellarswirl'; eleVariant: 'anemo' | 'cryo' }
  | undefined {
  if (/stellar[- ]conduct/i.test(name))
    return {
      variant: 'stellarconduct',
      eleVariant: ele === 'cryo' ? 'cryo' : 'electro',
    }
  if (/stellar[- ]swirl/i.test(name))
    return {
      variant: 'stellarswirl',
      eleVariant: ele === 'cryo' ? 'cryo' : 'anemo',
    }
  return undefined
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

/** A buff only counts once its passive or constellation is unlocked. */
function unlocked(source: CustomCharacterBuffSource, node: NumNode): NumNode {
  if (source === 'passive1') return greaterEq(input.asc, 1, node)
  if (source === 'passive2') return greaterEq(input.asc, 4, node)
  const c = source.match(/^constellation(\d)$/)?.[1]
  if (c) return greaterEq(input.constellation, Number(c), node)
  return node
}

/**
 * Formulas for a character's buffs: stat bonuses for itself (`self`) and for
 * the whole party (`team`), plus the sections that show them under their
 * passive or constellation, with a toggle for each named condition.
 */
function buffsOf(
  key: CharacterKey,
  buffs: CustomCharacterBuff[],
  ct: ICharacterTemplate
) {
  const self: Record<string, NumNode[]> = {}
  const team: Record<string, NumNode[]> = {}
  const conds = new Map<string, ReturnType<typeof cond>>()
  const groups = new Map<
    string,
    {
      source: CustomCharacterBuffSource
      condition?: string
      team: boolean
      fields: IFieldDisplay[]
    }
  >()
  for (const b of buffs) {
    if (!(b.stat in input.premod)) continue
    const isPercent = b.stat.endsWith('_')
    const amount = (v: number) => (isPercent ? percent(v) : constant(v))
    let node: NumNode = amount(b.value)
    if (b.scaling)
      node = prod(node, input.total[b.scaling.stat], 1 / b.scaling.per)
    if (b.max !== undefined) node = min(node, amount(b.max))
    if (b.target === 'team' && b.eles?.length) {
      const base = node
      node = b.excludeEles
        ? b.eles.reduce<NumNode>((n, e) => unequal(target.charEle, e, n), base)
        : sum(...b.eles.map((e) => equal(target.charEle, e, base)))
    }
    if (b.condition) {
      let c = conds.get(b.condition)
      if (!c) {
        const slug = b.condition.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)
        c = cond(key, `buff_${slug}`)
        conds.set(b.condition, c)
      }
      node = equal('on', c[1], node)
    }
    node = infoMut(unlocked(b.source, node), {
      path: b.stat,
      isTeamBuff: b.target === 'team',
    })
    const premod = b.target === 'team' ? team : self
    premod[b.stat] = [...(premod[b.stat] ?? []), node]

    const groupKey = `${b.source}|${b.condition ?? ''}`
    const group = groups.get(groupKey) ?? {
      source: b.source,
      condition: b.condition,
      team: false,
      fields: [],
    }
    group.team ||= b.target === 'team'
    group.fields.push({ node })
    groups.set(groupKey, group)
  }

  const sections: Partial<
    Record<CustomCharacterBuffSource, DocumentSection[]>
  > = {}
  for (const g of groups.values()) {
    const section: DocumentSection = g.condition
      ? ct.condTem(g.source, {
          // biome-ignore lint/style/noNonNullAssertion: set for every condition above
          path: conds.get(g.condition)![0],
          // biome-ignore lint/style/noNonNullAssertion: set for every condition above
          value: conds.get(g.condition)![1],
          name: g.condition,
          teamBuff: g.team,
          states: { on: { fields: g.fields } },
        })
      : ct.headerTem(g.source, { teamBuff: g.team, fields: g.fields })
    sections[g.source] = [...(sections[g.source] ?? []), section]
  }
  const total = (nodes: Record<string, NumNode[]>) =>
    Object.fromEntries(
      Object.entries(nodes).map(([stat, list]) => [
        stat,
        list.length === 1 ? list[0] : sum(...list),
      ])
    )
  return { self: total(self), team: total(team), sections }
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
      const labels = customCharacterRowLabels(row)
      row.params.forEach(({ index, format }, part) => {
        const values = talent.params[index]
        if (!values?.length) return
        const after = textAfter(row.template, index)
        const hits = after.match(/[×x]\s*(\d+)/)?.[1]
        const label = labels[part] ?? row.label
        const name = hits ? `${label} ×${hits}` : label
        const id = `${r}_${part}`
        const section = (move: string) =>
          tk === 'auto' ? move.split('_')[0] : tk
        const addNode = (sectionKey: string, node: NumNode) => {
          display[sectionKey] = { ...display[sectionKey], [id]: node }
          fields[tk].push({ node })
        }
        const stellar = isPercent(format) && stellarOf(label, def.ele)
        if (stellar) {
          addNode(
            section(moveOf(tk, label)),
            infoMut(
              stellarTalentDmgNode(
                scalingStat(after),
                values,
                tk,
                stellar.variant,
                stellar.eleVariant
              ),
              { name }
            )
          )
          return
        }
        // Normal Attack values are damage ("Aimed Shot"); other talents name it ("... DMG")
        const isDamage =
          isPercent(format) &&
          (tk === 'auto' || /DMG/i.test(label)) &&
          !notDamageRe.test(label) &&
          !reactionRe.test(label)
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
        const move = moveOf(tk, label)
        const additional: Data = {}
        if (
          tk === 'auto' &&
          (/fully[- ]charged/i.test(label) ||
            new RegExp(def.ele, 'i').test(label))
        )
          additional.hit = { ele: constant(def.ele) }
        if (move === 'plunging_collision')
          additional.hit = { ...additional.hit, reaction: constant('') }
        addNode(
          section(move),
          infoMut(dmgNode(scalingStat(after), values, move, additional), {
            name,
          })
        )
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

  const buffs = buffsOf(key, def.buffs ?? [], ct)
  const data = dataObjForCharacterSheet(key, display, {
    premod: { ...buffs.self, ...boosts },
    teamBuff: { premod: buffs.team },
  })
  const withBuffs = (
    k: CustomCharacterBuffSource,
    sections?: DocumentSection[]
  ) => {
    const all = [...(sections ?? []), ...(buffs.sections[k] ?? [])]
    return all.length ? all : undefined
  }

  const sheet: TalentSheet = {
    auto: ct.talentTem('auto', [{ fields: fields.auto }]),
    skill: ct.talentTem('skill', [{ fields: fields.skill }]),
    burst: ct.talentTem('burst', [{ fields: fields.burst }]),
  }
  if (def.passive1 || buffs.sections.passive1)
    sheet.passive1 = ct.talentTem('passive1', withBuffs('passive1'))
  if (def.passive2 || buffs.sections.passive2)
    sheet.passive2 = ct.talentTem('passive2', withBuffs('passive2'))
  if (def.passive3 || buffs.sections.passive3)
    sheet.passive3 = ct.talentTem('passive3', withBuffs('passive3'))
  if (def.otherPassives?.length || buffs.sections.passive)
    sheet.passive = ct.talentTem('passive', withBuffs('passive'))
  def.constellations.forEach((_, i) => {
    const ck = `constellation${i + 1}` as CustomCharacterBuffSource &
      TalentSheetElementKey
    const cFields = constellationFields[i + 1]
    sheet[ck] = ct.talentTem(
      ck,
      withBuffs(ck, cFields ? [{ fields: cFields }] : undefined)
    )
  })
  return new CharacterSheet(sheet, data)
}
