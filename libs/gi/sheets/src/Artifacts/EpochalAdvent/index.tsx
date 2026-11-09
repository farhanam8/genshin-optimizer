import { objKeyMap, range } from '@genshin-optimizer/common/util'
import type { ArtifactSetKey } from '@genshin-optimizer/gi/consts'
import type { Data } from '@genshin-optimizer/gi/wr'
import {
  equal,
  greaterEq,
  input,
  lookup,
  naught,
  percent,
} from '@genshin-optimizer/gi/wr'
import { cond, st } from '../../SheetUtil'
import { ArtifactSheet, setHeaderTemplate } from '../ArtifactSheet'
import { dataObjForArtifactSheet } from '../dataUtil'
import type { SetEffectSheet } from '../IArtifactSheet'

const key: ArtifactSetKey = 'EpochalAdvent'
const setHeader = setHeaderTemplate(key)

const set2_atk_ = greaterEq(input.artSet.EpochalAdvent, 2, percent(0.18))

// Undying Radiance: per Starspark (up to 2), Cryo DMG CRIT Rate +20%, and
// another +20% when that DMG is Stellar Glimmer reaction DMG. Only Cryo
// characters deal Cryo Stellar Glimmer DMG, so that part needs a Cryo wielder.
// Only while the wielder is the active (on-field) character.
const [condStarsparkPath, condStarspark] = cond(key, 'starspark')
const stacksArr = range(1, 2)
const perStack = () =>
  equal(
    input.activeCharKey,
    input.charKey,
    lookup(
      condStarspark,
      objKeyMap(stacksArr, (stack) => percent(0.2 * stack)),
      naught
    )
  )
const set4_cryo_critRate_ = greaterEq(input.artSet[key], 4, perStack())
const set4_stellarconduct_critRate_ = greaterEq(
  input.artSet[key],
  4,
  equal(input.charEle, 'cryo', perStack())
)
const set4_stellarswirl_critRate_ = greaterEq(
  input.artSet[key],
  4,
  equal(input.charEle, 'cryo', perStack())
)

export const data: Data = dataObjForArtifactSheet(key, {
  premod: {
    atk_: set2_atk_,
    cryo_critRate_: set4_cryo_critRate_,
    stellarconduct_critRate_: set4_stellarconduct_critRate_,
    stellarswirl_critRate_: set4_stellarswirl_critRate_,
  },
})

const sheet: SetEffectSheet = {
  2: {
    document: [{ header: setHeader(2), fields: [{ node: set2_atk_ }] }],
  },
  4: {
    document: [
      {
        header: setHeader(4),
        path: condStarsparkPath,
        value: condStarspark,
        name: 'Starspark (Undying Radiance, on-field)',
        states: objKeyMap(stacksArr, (stack) => ({
          name: st('stack', { count: stack }),
          fields: [
            { node: set4_cryo_critRate_ },
            { node: set4_stellarconduct_critRate_ },
            { node: set4_stellarswirl_critRate_ },
          ],
        })),
      },
    ],
  },
}
export default new ArtifactSheet(sheet, data)
