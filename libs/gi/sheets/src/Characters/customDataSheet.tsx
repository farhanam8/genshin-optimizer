import type {
  CharacterKey,
  CharacterSheetKey,
  CustomCharacterAmount,
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterDataDef,
  CustomCharacterRowEffect,
  CustomCharacterTalent,
  CustomCharacterTalentKey,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import {
  customCharacterRowLabels,
  customCharacterTalentKeys,
  plainCustomText,
} from '@genshin-optimizer/gi/consts'
import { KeyMap } from '@genshin-optimizer/gi/keymap'
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
  subscript,
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
  shieldNode,
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
  if (talent !== 'auto') {
    // e.g. "Anchor Normal Attack 1-Hit Electro DMG": Normal Attack DMG that
    // scales with this talent's level
    if (/normal attack/i.test(label)) return 'normal'
    if (/charged attack/i.test(label)) return 'charged'
    return talent
  }
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
  text: string,
  talents: Record<CustomCharacterTalentKey, CustomCharacterTalent>
): CustomCharacterTalentKey | undefined {
  const description = plainCustomText(text)
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
type Gated = {
  condition?: string
  conditionState?: string
  condition2?: string
  conditionState2?: string
}

function conditions(key: CharacterKey, users: Gated[]) {
  const all = new Map<
    string,
    { path: string[]; node: ReturnType<typeof cond>[1]; states: string[] }
  >()
  const pairs = users.flatMap((u) => [
    { condition: u.condition, conditionState: u.conditionState },
    { condition: u.condition2, conditionState: u.conditionState2 },
  ])
  for (const { condition, conditionState } of pairs) {
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
    /** `node` only while both toggles of `g` are in their states */
    gate(g: Gated, node: NumNode) {
      return this.when(
        g.condition,
        g.conditionState,
        this.when(g.condition2, g.conditionState2, node)
      )
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
  /** Makes sure a toggle can be set from this card, even without fields of its own */
  touch(source: CustomCharacterBuffSource, condition: string | undefined) {
    if (!condition) return
    const k = `${source}|${condition}`
    if (!this.groups.has(k))
      this.groups.set(k, {
        source,
        condition,
        team: false,
        fields: new Map<string, IFieldDisplay[]>(),
      })
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
/** Stats that buffs scaling from the giver's stats add after the other bonuses */
const totalPhaseStats: readonly string[] = ['atk', 'hp', 'def', 'eleMas']

/**
 * The amount of a buff or bonus (see `CustomCharacterAmount`). In the
 * `total` phase, scaling reads the giver's stat before total-phase bonuses,
 * like GO's own sheets, so that e.g. ATK from ATK does not depend on itself.
 */
function amountOf(
  a: Partial<CustomCharacterAmount>,
  def: CustomCharacterDataDef,
  isPercent: boolean,
  phase: 'premod' | 'total'
): NumNode {
  const fixed = (v: number) => (isPercent ? percent(v) : constant(v))
  const talentValue = ({
    talent,
    index,
  }: {
    talent: CustomCharacterTalentKey
    index: number
  }) =>
    subscript(
      input.total[`${talent}Index`],
      def.talents[talent].params[index] ?? [0],
      isPercent ? { unit: '%' } : undefined
    )
  let node: NumNode = a.talentParam
    ? prod(talentValue(a.talentParam), a.value ?? 1)
    : fixed(a.value ?? 0)
  if (a.scaling)
    node = prod(
      node,
      (phase === 'total' ? input.premod : input.total)[a.scaling.stat],
      1 / a.scaling.per
    )
  let cap: NumNode | undefined = a.maxTalentParam
    ? talentValue(a.maxTalentParam)
    : a.max !== undefined
      ? fixed(a.max)
      : undefined
  if (a.boost) {
    const factor = sum(
      one,
      greaterEq(input.constellation, a.boost.constellation, a.boost.factor - 1)
    )
    node = prod(node, factor)
    if (cap) cap = prod(cap, factor)
  }
  return cap ? min(node, cap) : node
}

/**
 * Formulas for a character's buffs: stat bonuses for itself (`self`), and
 * for the party (`team`, including itself; `others`; `active`).
 */
function buffsOf(
  key: CharacterKey,
  def: CustomCharacterDataDef,
  buffs: CustomCharacterBuff[],
  conds: Conditions,
  shown: SourceFields
) {
  const phases = {
    self: { premod: {}, total: {} } as Record<
      string,
      Record<string, NumNode[]>
    >,
    team: { premod: {}, total: {} } as Record<
      string,
      Record<string, NumNode[]>
    >,
  }
  for (const b of buffs) {
    if (!(b.stat in input.premod)) continue
    const phase =
      b.scaling && totalPhaseStats.includes(b.stat) ? 'total' : 'premod'
    let node = amountOf(b, def, b.stat.endsWith('_'), phase)
    const forParty = b.target !== 'self'
    if (forParty && b.eles?.length) {
      const base = node
      node = b.excludeEles
        ? b.eles.reduce<NumNode>((n, e) => unequal(target.charEle, e, n), base)
        : sum(...b.eles.map((e) => equal(target.charEle, e, base)))
    }
    if (b.target === 'others') node = unequal(target.charKey, key, node)
    if (b.target === 'active')
      node = equal(input.activeCharKey, target.charKey, node)
    node = infoMut(unlocked(b.source, conds.gate(b, node)), {
      path: b.stat,
      isTeamBuff: forParty,
    })
    const stats = phases[forParty ? 'team' : 'self'][phase]
    stats[b.stat] = [...(stats[b.stat] ?? []), node]
    shown.add(b.source, b.condition, b.conditionState, forParty, { node })
    shown.touch(b.source, b.condition2)
  }
  const total = (nodes: Record<string, NumNode[]>) =>
    Object.fromEntries(
      Object.entries(nodes).map(([stat, list]) => [
        stat,
        list.length === 1 ? list[0] : sum(...list),
      ])
    )
  return {
    self: {
      premod: total(phases.self.premod),
      total: total(phases.self.total),
    },
    team: {
      premod: total(phases.team.premod),
      total: total(phases.team.total),
    },
  }
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
  /** Other values (durations, CD, ...), shown after the DMG values */
  const valueFields: Record<CustomCharacterTalentKey, IFieldDisplay[]> = {
    auto: [],
    skill: [],
    burst: [],
  }

  for (const tk of ['auto', 'skill', 'burst'] as const) {
    const talent = def.talents[tk]
    const levelIndex = input.total[`${tk}Index`]
    talent.rows.forEach((row, r) => {
      const labels = customCharacterRowLabels(row)
      // "Shield DMG Absorption|{param5:F1P} ATK+{param6:F1}": one shield
      const pct = row.params.find((p) => isPercent(p.format))
      const flat = row.params.find((p) => !isPercent(p.format))
      if (/shield/i.test(row.label) && pct) {
        const node = infoMut(
          shieldNode(
            scalingStat(textAfter(row.template, pct.index)),
            subscript(levelIndex, talent.params[pct.index] ?? [0], {
              unit: '%',
            }),
            flat ? subscript(levelIndex, talent.params[flat.index] ?? [0]) : 0
          ),
          { name: row.label, variant: def.ele }
        )
        display[tk] = { ...display[tk], [`${r}_shield`]: node }
        fields[tk].push({ node })
        return
      }
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
          valueFields[tk].push({
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
        // Normal/Charged Attacks of a skill or burst keep the character's element
        const attackOfTalent = tk !== 'auto' && move !== tk
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
            attackOfTalent ||
            (tk === 'auto' &&
              (/fully[- ]charged/i.test(label) ||
                new RegExp(def.ele, 'i').test(label)))
          )
            additional.hit = { ele: constant(def.ele) }
          if (move === 'plunging_collision')
            additional.hit = { ...additional.hit, reaction: constant('') }
          return dmgNode(
            scalingStat(after),
            values,
            move,
            additional,
            multiplier,
            attackOfTalent ? tk : undefined
          )
        }

        // `bonus` effects: stat bonuses for this value only
        const bonusStats: Record<string, NumNode[]> = {}
        for (const e of effects) {
          if (e.kind !== 'bonus' || !e.stat || !effectMatches(e, tk, label))
            continue
          const amount = unlocked(
            e.source,
            conds.gate(e, amountOf(e, def, e.stat.endsWith('_'), 'premod'))
          )
          bonusStats[e.stat] = [...(bonusStats[e.stat] ?? []), amount]
        }
        const bonuses = Object.keys(bonusStats).length
          ? Object.fromEntries(
              Object.entries(bonusStats).map(([stat, list]) => [
                stat,
                list.length === 1 ? list[0] : sum(...list),
              ])
            )
          : undefined

        // "deals 125% of its original DMG": 1 + 0.25 while active
        const multipliers = effects
          .filter((e) => e.kind === 'multiplier' && effectMatches(e, tk, label))
          .map((e) =>
            unlocked(
              e.source,
              conds.gate(
                e,
                prod(
                  constant(e.value - 1),
                  e.boost
                    ? sum(
                        one,
                        greaterEq(
                          input.constellation,
                          e.boost.constellation,
                          e.boost.factor - 1
                        )
                      )
                    : one
                )
              )
            )
          )
        const node = infoMut(
          dmg(
            multipliers.length ? sum(one, ...multipliers) : undefined,
            bonuses
          ),
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
              conds.gate(e, dmg(constant(e.value), { ...bonuses, ...extra }))
            ),
            { name: `${e.name ?? 'Extra hit'}: ${name}` }
          )
          display[e.source] = { ...display[e.source], [`${tk}_${id}`]: hit }
          shown.add(e.source, e.condition, e.conditionState, false, {
            node: hit,
          })
          shown.touch(e.source, e.condition2)
        }
      })
    })
  }

  for (const e of effects) {
    shown.touch(e.source, e.condition2)
    if (e.kind === 'multiplier')
      shown.add(e.source, e.condition, e.conditionState, false, {
        text: e.name ?? e.match,
        value: e.value * 100,
        fixed: 0,
        unit: '%',
      })
    if (e.kind === 'bonus' && e.stat)
      shown.add(e.source, e.condition, e.conditionState, false, {
        node: infoMut(
          unlocked(
            e.source,
            conds.gate(e, amountOf(e, def, e.stat.endsWith('_'), 'premod'))
          ),
          // a name, not `path` + `textSuffix`: a suffix is stored per path and
          // would rename the stat everywhere
          {
            name: `${KeyMap.get(e.stat)} (${e.name ?? e.match})`,
            unit: e.stat.endsWith('_') ? '%' : undefined,
          }
        ),
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

  const buffs = buffsOf(key, def, def.buffs ?? [], conds, shown)
  const sourceSections = shown.sections(ct, conds)
  const data = dataObjForCharacterSheet(key, display, {
    premod: { ...buffs.self.premod, ...boosts },
    total: buffs.self.total,
    teamBuff: { premod: buffs.team.premod, total: buffs.team.total },
  })
  const withBuffs = (
    k: CustomCharacterBuffSource,
    sections?: DocumentSection[]
  ) => {
    const all = [...(sections ?? []), ...(sourceSections[k] ?? [])]
    return all.length ? all : undefined
  }

  for (const tk of customCharacterTalentKeys)
    fields[tk] = [...fields[tk], ...valueFields[tk]]

  const sheet: TalentSheet = {
    auto: ct.talentTem('auto', [{ fields: fields.auto }]),
    skill: ct.talentTem(
      'skill',
      withBuffs('skill', [{ fields: fields.skill }])
    ),
    burst: ct.talentTem(
      'burst',
      withBuffs('burst', [{ fields: fields.burst }])
    ),
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
