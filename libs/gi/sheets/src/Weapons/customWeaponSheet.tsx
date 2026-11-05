import type { CustomWeaponDef, WeaponKey } from '@genshin-optimizer/gi/consts'
import type { NumNode } from '@genshin-optimizer/gi/wr'
import {
  equal,
  infoMut,
  input,
  subscript,
  sum,
  target,
  unequal,
} from '@genshin-optimizer/gi/wr'
import type { IFieldDisplay } from '../fieldDisplay'
import { cond, st } from '../SheetUtil'
import type { DocumentSection } from '../sheet'
import { dataObjForWeaponSheet } from './util'
import { headerTemplate, WeaponSheet } from './WeaponSheet'

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

/**
 * Sheet of a custom weapon: its passive buffs, each with its value at
 * refinements 1..5, for the wielder, the party or the other party members,
 * optionally behind a named toggle (with options, when buffs name states).
 */
export function sheetForCustomWeapon(def: CustomWeaponDef): WeaponSheet {
  const key = def.key as WeaponKey
  const conds = new Map<
    string,
    { path: string[]; node: ReturnType<typeof cond>[1]; states: string[] }
  >()
  for (const { condition, conditionState } of def.buffs ?? []) {
    if (!condition) continue
    let c = conds.get(condition)
    if (!c) {
      const [path, node] = cond(key, `buff_${slug(condition)}`)
      c = { path, node, states: [] }
      conds.set(condition, c)
    }
    const state = conditionState ?? ''
    if (!c.states.includes(state)) c.states.push(state)
  }
  const stateKey = (state = '') => (state ? slug(state) : 'on')

  const self: Record<string, NumNode[]> = {}
  const team: Record<string, NumNode[]> = {}
  /** Fields per toggle ('' = always on) and toggle option */
  const fields = new Map<string, Map<string, IFieldDisplay[]>>()
  const teamToggles = new Set<string>()
  for (const b of def.buffs ?? []) {
    if (!(b.stat in input.premod)) continue
    let node: NumNode = subscript(input.weapon.refinement, [-1, ...b.values])
    const forParty = b.target !== 'self'
    if (forParty && b.eles?.length) {
      const base = node
      node = b.excludeEles
        ? b.eles.reduce<NumNode>((n, e) => unequal(target.charEle, e, n), base)
        : sum(...b.eles.map((e) => equal(target.charEle, e, base)))
    }
    if (b.target === 'others')
      node = unequal(target.charKey, input.charKey, node)
    if (b.target === 'active')
      node = equal(input.activeCharKey, target.charKey, node)
    const c = b.condition ? conds.get(b.condition) : undefined
    if (c) node = equal(stateKey(b.conditionState), c.node, node)
    node = infoMut(node, { path: b.stat, isTeamBuff: forParty })
    const premod = forParty ? team : self
    premod[b.stat] = [...(premod[b.stat] ?? []), node]

    const toggle = b.condition ?? ''
    if (forParty) teamToggles.add(toggle)
    const byState = fields.get(toggle) ?? new Map<string, IFieldDisplay[]>()
    const state = b.conditionState ?? ''
    byState.set(state, [...(byState.get(state) ?? []), { node }])
    fields.set(toggle, byState)
  }

  const document: DocumentSection[] = []
  for (const [toggle, byState] of fields) {
    const c = toggle ? conds.get(toggle) : undefined
    document.push(
      c
        ? {
            value: c.node,
            path: c.path,
            teamBuff: teamToggles.has(toggle),
            header: headerTemplate(key, st('conditional')),
            name: toggle,
            states: Object.fromEntries(
              c.states.map((state) => [
                stateKey(state),
                {
                  ...(state ? { name: state } : {}),
                  fields: byState.get(state) ?? [],
                },
              ])
            ),
          }
        : {
            header: headerTemplate(key, st('base')),
            teamBuff: teamToggles.has(''),
            fields: byState.get('') ?? [],
          }
    )
  }
  // Show the passive's description even without buffs
  if (!document.length)
    document.push({ header: headerTemplate(key), fields: [] })

  const total = (nodes: Record<string, NumNode[]>) =>
    Object.fromEntries(
      Object.entries(nodes).map(([stat, list]) => [
        stat,
        list.length === 1 ? list[0] : sum(...list),
      ])
    )
  const data = dataObjForWeaponSheet(key, {
    premod: total(self),
    teamBuff: { premod: total(team) },
  })
  return new WeaponSheet({ document }, data)
}
