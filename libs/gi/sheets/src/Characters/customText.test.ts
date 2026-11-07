import { describe, expect, it } from 'vitest'
import { customTextToMarkup, plainCustomText } from '@genshin-optimizer/gi/consts'

describe('customTextToMarkup', () => {
  const glossary = [{ name: 'Sealing', description: 'A special state.' }]
  const opts = { ns: 'char_Test_gen', glossary }

  it('colors element words', () => {
    expect(customTextToMarkup('dealing AoE Cryo DMG', opts)).toBe(
      'dealing <cryo>AoE Cryo DMG</cryo>'
    )
    expect(customTextToMarkup('Electro RES and Electro-Charged', opts)).toBe(
      '<electro>Electro RES</electro> and Electro-Charged'
    )
  })

  it('makes bold text and glossary tooltips', () => {
    expect(customTextToMarkup('**Tap**: [[Seals|Sealing]]', opts)).toBe(
      '<strong>Tap</strong>: <strong><tooltip ns=char_Test_gen baseKey18=glossary.g0 values=[]>Seals</tooltip></strong>'
    )
    expect(customTextToMarkup('[[Unknown]]', opts)).toBe(
      '<strong>Unknown</strong>'
    )
    expect(customTextToMarkup('[[Radiance|@11500004]]', opts)).toBe(
      '<strong><tooltip ns=tooltips_gen baseKey18=11500004 values=[]>Radiance</tooltip></strong>'
    )
    expect(
      customTextToMarkup('[[Seals|Sealing]]', { ...opts, links: false })
    ).toBe('<strong>Seals</strong>')
  })

  it('does not pass raw tags through', () => {
    expect(customTextToMarkup('<b>x</b>', opts)).toBe('‹b›x‹/b›')
  })

  it('strips markup for plain text', () => {
    expect(plainCustomText('**To the New World** and [[Seals|Sealing]]')).toBe(
      'To the New World and Seals'
    )
  })
})
