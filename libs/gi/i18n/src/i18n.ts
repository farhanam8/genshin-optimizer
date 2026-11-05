import type {
  CustomCharacterDataDef,
  CustomCharacterText,
} from '@genshin-optimizer/gi/consts'
import {
  customCharacterDefs,
  isCustomCharacterDataDef,
} from '@genshin-optimizer/gi/consts'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

// Probably a way to auto-populate this.
export const languageCodeList = [
  'chs',
  'cht',
  'de',
  'en',
  'es',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'pt',
  'ru',
  'th',
  'tr',
  'vi',
]

/**
 * @see: https://www.i18next.com/translation-function/essentials
 * @see: https://react.i18next.com/latest/using-with-hooks
 */
i18n
  // load translation using http ->
  // see /public/locales (i.e. https://github.com/i18next/react-i18next/tree/master/example/react/public/locales)
  // learn more: https://github.com/i18next/i18next-http-backend
  .use(Backend)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // Configure localization.
  .init({
    // debug: process.env.NODE_ENV === "development",
    // Use English strings by default, if the current language does not include
    // the specified string.
    fallbackLng: 'en',
    // fallbackLng: 'dev', // Switch to this to force the fallback value on missing strings.

    // List all translation namespaces.
    ns: ['languages', 'ui'],
    // Specify the default namespace.
    defaultNS: 'ui',

    // Only use the language code, skipping the region code.
    // For example, en-US becomes simply en.
    load: 'languageOnly',

    returnNull: false,

    backend: {
      // Path to load localization data from.
      // Custom characters load the text files of their template character.
      loadPath: (_lngs: string[], namespaces: string[]) =>
        `./assets/locales/{{lng}}/${namespaces
          .map(customCharacterNamespace)
          .join('+')}.json`,
    },
    interpolation: {
      escapeValue: false, //react does interlopation already
      skipOnVariables: false, // Enables passing nested interpolation
    },
  })
// Show custom characters' own names, everywhere a character name is looked up.
i18n.store.on('added', (lng: string, ns: string) => {
  for (const { key, name } of customCharacterDefs) {
    if (ns === 'charNames_gen' || ns === 'sillyWisher_charNames')
      i18n.addResource(lng, ns, key, name, { silent: true })
    else if (ns === `char_${key}_gen`)
      i18n.addResource(lng, ns, 'name', name, { silent: true })
  }
})
// Imported custom characters bring their own talent texts, in every language.
for (const def of customCharacterDefs)
  if (isCustomCharacterDataDef(def))
    for (const lng of languageCodeList)
      i18n.addResourceBundle(
        lng,
        `char_${def.key}_gen`,
        dataCharacterTexts(def),
        true,
        true
      )
i18n.services.formatter?.add('percent', (value, _lng, options) => {
  return (value * 100).toFixed(options.fixed)
})
i18n.services.formatter?.add('fixed', (value, _lng, options) => {
  return value.toFixed(options.fixed)
})
console.log('i18n initialized')

export { i18n }

/** Maps a template custom character's text namespace to its template's namespace. */
function customCharacterNamespace(ns: string): string {
  for (const def of customCharacterDefs) {
    if (isCustomCharacterDataDef(def)) continue
    const { key, template } = def
    if (ns === `char_${key}_gen`) return `char_${template}_gen`
    if (ns === `char_${key}`) return `char_${template}`
  }
  return ns
}

/** Talent texts of an imported custom character, in the `char_<key>_gen` layout. */
function dataCharacterTexts(def: CustomCharacterDataDef) {
  const lines = (text: string) =>
    Object.fromEntries(
      text
        .split('\n')
        .filter((line) => line.trim())
        .map((line, i) => [i, line])
    )
  const entry = (t?: CustomCharacterText) =>
    t ? { name: t.name, description: lines(t.description) } : undefined
  return {
    name: def.name,
    title: def.title ?? '',
    description: '',
    constellationName: '',
    auto: entry(def.talents.auto),
    skill: entry(def.talents.skill),
    burst: entry(def.talents.burst),
    passive1: entry(def.passive1),
    passive2: entry(def.passive2),
    passive3: entry(def.passive3),
    passive: entry(def.otherPassives?.[0]),
    ...Object.fromEntries(
      def.constellations.map((c, i) => [`constellation${i + 1}`, entry(c)])
    ),
  }
}
