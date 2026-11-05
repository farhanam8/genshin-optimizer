import type {
  CharacterKey,
  CharacterSheetKey,
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterDataDef,
  CustomCharacterRowEffect,
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
  one,
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
 * value is shown for the current talent level. Constellations that increase
 * a talent level (usually C3/C5) are applied.
 *
 * Passives and constellations can also have buffs (stat bonuses for this
 * character, the party, or the other party members) and row effects (DMG
 * multipliers on matching talent values, or extra hits copying them), both
 * optionally behind a named toggle that may have several states.
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

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

/**
 * The named toggles of a character. A toggle used without states is on/off;
 * a toggle whose users name states is a choice between those states.
 */
function conditions(
  key: CharacterKey,
  users: { condition?: string; conditionState?: string }[]
) {
  const all = new Map<
    string,
    { path: string[]; node: ReturnType<typeof cond>[1]; states: string[] }
  >()
  for (const { condition, conditionState } of users) {
    if (!condition) continue
    let c = all.get(condition)
    if (!c) {
      const [path, node] = cond(key, `buff_${slug(condition)}`)
      c = { path, node, states: [] }
      all.set(condition, c)
    }
    const state = conditionState ?? ''
    if (!c.states.includes(state)) c.states.push(state)
  }
  const stateKey = (state = '') => (state ? slug(state) : 'on')
  return {
    all,
    stateKey,
    /** `node` only while the toggle is in `state` */
    when(
      condition: string | undefined,
      state: string | undefined,
      node: NumNode
    ) {
      const c = condition && all.get(condition)
      return c ? equal(stateKey(state), c.node, node) : node
    },
  }
}
type Conditions = ReturnType<typeof conditions>

/** Fields shown under a passive or constellation, per toggle and state. */
class SourceFields {
  private groups = new Map<
    string,
    {
      source: CustomCharacterBuffSource
      condition?: string
      team: boolean
      fields: Map<string, IFieldDisplay[]>
    }
  >()
  add(
    source: CustomCharacterBuffSource,
    condition: string | undefined,
    state: string | undefined,
    team: boolean,
    field: IFieldDisplay
  ) {
    const k = `${source}|${condition ?? ''}`
    const g = this.groups.get(k) ?? {
      source,
      condition,
      team: false,
      fields: new Map<string, IFieldDisplay[]>(),
    }
    g.team ||= team
    const s = state ?? ''
    g.fields.set(s, [...(g.fields.get(s) ?? []), field])
    this.groups.set(k, g)
  }
  sections(ct: ICharacterTemplate, conds: Conditions) {
    const sections: Partial<
      Record<CustomCharacterBuffSource, DocumentSection[]>
    > = {}
    for (const g of this.groups.values()) {
      const c = g.condition ? conds.all.get(g.condition) : undefined
      const section: DocumentSection =
        g.condition && c
          ? ct.condTem(g.source, {
              path: c.path,
              value: c.node,
              name: g.condition,
              teamBuff: g.team,
              // every state of the toggle can be picked from every card using it
              states: Object.fromEntries(
                c.states.map((state) => [
                  conds.stateKey(state),
                  {
                    ...(state ? { name: state } : {}),
                    fields: g.fields.get(state) ?? [],
                  },
                ])
              ),
            })
          : ct.headerTem(g.source, {
              teamBuff: g.team,
              fields: g.fields.get('') ?? [],
            })
      sections[g.source] = [...(sections[g.source] ?? []), section]
    }
    return sections
  }
}

/**
 * Formulas for a character's buffs: stat bonuses for itself (`self`), and
 * for the party (`team`, including itself, and `others`).
 */
function buffsOf(
  key: CharacterKey,
  buffs: CustomCharacterBuff[],
  conds: Conditions,
  shown: SourceFields
) {
  const self: Record<string, NumNode[]> = {}
  const team: Record<string, NumNode[]> = {}
  for (const b of buffs) {
    if (!(b.stat in input.premod)) continue
    const isPercent = b.stat.endsWith('_')
    const amount = (v: number) => (isPercent ? percent(v) : constant(v))
    let node: NumNode = amount(b.value)
    if (b.scaling)
      node = prod(node, input.total[b.scaling.stat], 1 / b.scaling.per)
    if (b.max !== undefined) node = min(node, amount(b.max))
    const forParty = b.target !== 'self'
    if (forParty && b.eles?.length) {
      const base = node
      node = b.excludeEles
        ? b.eles.reduce<NumNode>((n, e) => unequal(target.charEle, e, n), base)
        : sum(...b.eles.map((e) => equal(target.charEle, e, base)))
    }
    if (b.target === 'others') node = unequal(target.charKey, key, node)
    node = infoMut(
      unlocked(b.source, conds.when(b.condition, b.conditionState, node)),
      { path: b.stat, isTeamBuff: forParty }
    )
    const premod = forParty ? team : self
    premod[b.stat] = [...(premod[b.stat] ?? []), node]
    shown.add(b.source, b.condition, b.conditionState, forParty, { node })
  }
  const total = (nodes: Record<string, NumNode[]>) =>
    Object.fromEntries(
      Object.entries(nodes).map(([stat, list]) => [
        stat,
        list.length === 1 ? list[0] : sum(...list),
      ])
    )
  return { self: total(self), team: total(team) }
}

const effectMatches = (
  e: CustomCharacterRowEffect,
  tk: CustomCharacterTalentKey,
  name: string
) => (!e.talent || e.talent === tk) && new RegExp(e.match, 'i').test(name)

export function dataSheetForCustomCharacter(
  def: CustomCharacterDataDef
): CharacterSheet {
  const key = def.key as CharacterKey
  const ct = charTemplates(key as CharacterSheetKey)
  const effects = def.rowEffects ?? []
  const conds = conditions(key, [...(def.buffs ?? []), ...effects])
  const shown = new SourceFields()
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
        const stellar = isPercent(format) && stellarOf(label, def.ele)
        // Normal Attack values are damage ("Aimed Shot"); other talents name it ("... DMG")
        const isDamage =
          !!stellar ||
          (isPercent(format) &&
            (tk === 'auto' || /DMG/i.test(label)) &&
            !notDamageRe.test(label) &&
            !reactionRe.test(label))
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
        const section = tk === 'auto' ? move.split('_')[0] : tk
        /** This value's DMG formula, times `multiplier`, with `extra` stats for this hit only. */
        const dmg = (multiplier?: NumNode, extra?: Data['premod']) => {
          const additional: Data = extra ? { premod: extra } : {}
          if (stellar)
            return stellarTalentDmgNode(
              scalingStat(after),
              values,
              tk,
              stellar.variant,
              stellar.eleVariant,
              additional,
              multiplier
            )
          if (
            tk === 'auto' &&
            (/fully[- ]charged/i.test(label) ||
              new RegExp(def.ele, 'i').test(label))
          )
            additional.hit = { ele: constant(def.ele) }
          if (move === 'plunging_collision')
            additional.hit = { ...additional.hit, reaction: constant('') }
          return dmgNode(
            scalingStat(after),
            values,
            move,
            additional,
            multiplier
          )
        }

        // "deals 125% of its original DMG": 1 + 0.25 while active
        const multipliers = effects
          .filter((e) => e.kind === 'multiplier' && effectMatches(e, tk, label))
          .map((e) =>
            unlocked(
              e.source,
              conds.when(e.condition, e.conditionState, constant(e.value - 1))
            )
          )
        const node = infoMut(
          dmg(multipliers.length ? sum(one, ...multipliers) : undefined),
          { name }
        )
        display[section] = { ...display[section], [id]: node }
        fields[tk].push({ node })

        for (const e of effects) {
          if (e.kind !== 'extraHit' || !effectMatches(e, tk, label)) continue
          const extra = e.bonuses?.length
            ? Object.fromEntries(
                e.bonuses.map((b) => [
                  b.stat,
                  b.stat.endsWith('_') ? percent(b.value) : constant(b.value),
                ])
              )
            : undefined
          const hit = infoMut(
            unlocked(
              e.source,
              conds.when(
                e.condition,
                e.conditionState,
                dmg(constant(e.value), extra)
              )
            ),
            { name: `${e.name ?? 'Extra hit'}: ${name}` }
          )
          display[e.source] = { ...display[e.source], [`${tk}_${id}`]: hit }
          shown.add(e.source, e.condition, e.conditionState, false, {
            node: hit,
          })
        }
      })
    })
  }

  for (const e of effects)
    if (e.kind === 'multiplier')
      shown.add(e.source, e.condition, e.conditionState, false, {
        text: e.name ?? e.match,
        value: e.value * 100,
        fixed: 0,
        unit: '%',
      })

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

  const buffs = buffsOf(key, def.buffs ?? [], conds, shown)
  const sourceSections = shown.sections(ct, conds)
  const data = dataObjForCharacterSheet(key, display, {
    premod: { ...buffs.self, ...boosts },
    teamBuff: { premod: buffs.team },
  })
  const withBuffs = (
    k: CustomCharacterBuffSource,
    sections?: DocumentSection[]
  ) => {
    const all = [...(sections ?? []), ...(sourceSections[k] ?? [])]
    return all.length ? all : undefined
  }

  const sheet: TalentSheet = {
    auto: ct.talentTem('auto', [{ fields: fields.auto }]),
    skill: ct.talentTem('skill', [{ fields: fields.skill }]),
    burst: ct.talentTem('burst', [{ fields: fields.burst }]),
  }
  if (def.passive1 || sourceSections.passive1)
    sheet.passive1 = ct.talentTem('passive1', withBuffs('passive1'))
  if (def.passive2 || sourceSections.passive2)
    sheet.passive2 = ct.talentTem('passive2', withBuffs('passive2'))
  if (def.passive3 || sourceSections.passive3)
    sheet.passive3 = ct.talentTem('passive3', withBuffs('passive3'))
  if (def.otherPassives?.length || sourceSections.passive)
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
