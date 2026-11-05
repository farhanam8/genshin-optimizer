import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import { CardThemed, ImgIcon, ModalWrapper } from '@genshin-optimizer/common/ui'
import { characterAsset, imgAssets } from '@genshin-optimizer/gi/assets'
import type {
  CharacterKey,
  CustomCharacterAscStatKey,
  CustomCharacterDataDef,
  CustomCharacterDef,
  CustomCharacterTemplateDef,
  ElementKey,
  WeaponTypeKey,
} from '@genshin-optimizer/gi/consts'
import {
  allElementKeys,
  allWeaponTypeKeys,
  customCharacterAscStatKeys,
  isCustomCharacterDataDef,
  nextCustomCharacterKey,
  parseCustomCharacterPack,
  readCustomCharacterDefs,
  writeCustomCharacterDefs,
} from '@genshin-optimizer/gi/consts'
import { useDatabase } from '@genshin-optimizer/gi/db-ui'
import {
  getCharEle,
  getCharRefStats,
  getCharStat,
} from '@genshin-optimizer/gi/stats'
import { ElementIcon } from '@genshin-optimizer/gi/svgicons'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import EditIcon from '@mui/icons-material/Edit'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArtifactIconStatWithUnit } from '../artifact/ArtifactStatKeyDisplay'
import {
  CustomCharacterDataForm,
  imageTemplateKeys,
} from './CustomCharacterDataForm'

type FormState = {
  key: string
  name: string
  template: CharacterKey | null
  ele: ElementKey
  weaponType: WeaponTypeKey
  rarity: 4 | 5
  hp: string
  atk: string
  def: string
  ascStat: CustomCharacterAscStatKey
  ascValue: string
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isPercentStat = (stat: string) => stat.endsWith('_')
const round = (n: number, digits = 0) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const templateKeys = imageTemplateKeys

/** An existing character to borrow images from: same element and weapon if possible. */
function pickImageTemplate(ele: ElementKey, weaponType: WeaponTypeKey) {
  const keys = imageTemplateKeys()
  return (
    keys.find(
      (k) => getCharEle(k) === ele && getCharStat(k).weaponType === weaponType
    ) ??
    keys.find((k) => getCharEle(k) === ele) ??
    keys[0]
  )
}

type ImportItem = { def: CustomCharacterDataDef; isNew: boolean }

/**
 * Turns the characters of a pack into definitions. A character already
 * imported from the same source id is updated, keeping its key, name and images.
 */
function importPack(
  json: string,
  defs: CustomCharacterDef[]
): { items: ImportItem[] } | { error: string } {
  const parsed = parseCustomCharacterPack(json)
  if ('error' in parsed) return parsed
  const all = [...defs]
  const items: ImportItem[] = []
  for (const char of parsed.characters) {
    const existing = all.find(
      (d): d is CustomCharacterDataDef =>
        isCustomCharacterDataDef(d) &&
        d.sourceId !== undefined &&
        d.sourceId === char.sourceId
    )
    const def: CustomCharacterDataDef = existing
      ? {
          ...char,
          key: existing.key,
          name: existing.name,
          template: existing.template,
          // image URLs set in GO win over the pack's
          images: { ...char.images, ...existing.images },
          // a pack without buffs keeps the buffs set in GO
          buffs: char.buffs ?? existing.buffs,
          rowEffects: char.rowEffects ?? existing.rowEffects,
        }
      : {
          ...char,
          key: nextCustomCharacterKey(all),
          template: pickImageTemplate(char.ele, char.weaponType),
        }
    if (!existing) all.push(def)
    items.push({ def, isNew: !existing })
  }
  return { items }
}

/** Form values prefilled from a template character's level 90 stats. */
function formFromTemplate(template: CharacterKey, prev: FormState): FormState {
  const { weaponType, rarity } = getCharStat(template)
  const { hp, atk, def, ascStat, ascValue } = getCharRefStats(template)
  const stat = (customCharacterAscStatKeys as readonly string[]).includes(
    ascStat ?? ''
  )
    ? (ascStat as CustomCharacterAscStatKey)
    : 'atk_'
  return {
    ...prev,
    template,
    ele: getCharEle(template),
    weaponType,
    rarity: rarity === 4 ? 4 : 5,
    hp: `${round(hp)}`,
    atk: `${round(atk)}`,
    def: `${round(def)}`,
    ascStat: stat,
    ascValue: `${isPercentStat(stat) ? round(ascValue * 100, 1) : round(ascValue, 1)}`,
  }
}

function formFromDef(def: CustomCharacterTemplateDef): FormState {
  return {
    key: def.key,
    name: def.name,
    template: def.template as CharacterKey,
    ele: def.ele,
    weaponType: def.weaponType,
    rarity: def.rarity,
    hp: `${round(def.hp, 2)}`,
    atk: `${round(def.atk, 2)}`,
    def: `${round(def.def, 2)}`,
    ascStat: def.ascStat,
    ascValue: `${
      isPercentStat(def.ascStat)
        ? round(def.ascValue * 100, 2)
        : round(def.ascValue, 2)
    }`,
  }
}

const emptyForm = (key: string): FormState => ({
  key,
  name: '',
  template: null,
  ele: 'pyro',
  weaponType: 'sword',
  rarity: 5,
  hp: '',
  atk: '',
  def: '',
  ascStat: 'critDMG_',
  ascValue: '',
})

/** Saves definitions, then reloads GO so every part of the app picks them up. */
function saveAndReload(defs: CustomCharacterDef[], openKey?: string) {
  writeCustomCharacterDefs(defs)
  if (openKey) window.location.hash = `#/characters/${openKey}`
  window.location.reload()
}

/**
 * Create, edit and delete custom characters.
 * A custom character reuses the kit of an existing character (its "template")
 * with its own name, element, weapon type, rarity and base stats.
 */
export function CustomCharacterModal({
  show,
  onHide,
}: {
  show: boolean
  onHide: () => void
}) {
  const { t } = useTranslation(['page_character', 'charNames_gen'])
  const database = useDatabase()
  const [defs] = useState(() => readCustomCharacterDefs())
  const [form, setForm] = useState<FormState | null>(null)
  const [dataEdit, setDataEdit] = useState<CustomCharacterDataDef | null>(null)
  const [imported, setImported] = useState<ImportItem[] | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setForm(null)
    setDataEdit(null)
    setImported(null)
    setImportError('')
    onHide()
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const result = importPack(await file.text(), defs)
    if ('error' in result) {
      setImportError(t(`customChar.importErrors.${result.error}`))
      setImported(null)
    } else {
      setImportError('')
      setImported(result.items)
    }
  }

  const saveOne = (def: CustomCharacterDef) => {
    const isNew = !defs.some(({ key }) => key === def.key)
    saveAndReload(
      isNew ? [...defs, def] : defs.map((d) => (d.key === def.key ? def : d)),
      isNew ? def.key : undefined
    )
  }

  const onDelete = (def: CustomCharacterDef) => {
    if (!window.confirm(t('customChar.deleteConfirm', { name: def.name })))
      return
    const key = def.key as CharacterKey
    if (database.chars.get(key)) database.chars.remove(key)
    saveAndReload(defs.filter(({ key }) => key !== def.key))
  }

  return (
    <ModalWrapper open={show} onClose={close}>
      <CardThemed>
        <CardHeader
          title={t('customChar.title')}
          action={
            <IconButton onClick={close}>
              <CloseIcon />
            </IconButton>
          }
        />
        <Divider />
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert severity="info">{t('customChar.info')}</Alert>
          {importError && <Alert severity="error">{importError}</Alert>}
          {dataEdit ? (
            <CustomCharacterDataForm
              def={dataEdit}
              onCancel={() => setDataEdit(null)}
              onSave={saveOne}
            />
          ) : form ? (
            <CustomCharacterForm
              form={form}
              setForm={setForm}
              onCancel={() => setForm(null)}
              onSave={saveOne}
            />
          ) : imported ? (
            <>
              <Typography>{t('customChar.importPreview')}</Typography>
              {imported.map(({ def, isNew }) => (
                <CardThemed bgt="light" key={def.key}>
                  <CardContent
                    sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <ImgIcon
                      src={characterAsset(
                        def.template as CharacterKey,
                        'iconSide'
                      )}
                      size={3}
                    />
                    <Box flexGrow={1}>
                      <Typography variant="h6">
                        <ElementIcon
                          ele={def.ele}
                          iconProps={iconInlineProps}
                        />{' '}
                        {def.name} {'★'.repeat(def.rarity)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          isNew
                            ? 'customChar.importNew'
                            : 'customChar.importUpdate'
                        )}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardThemed>
              ))}
              <Box display="flex" gap={1} justifyContent="flex-end">
                <Button color="secondary" onClick={() => setImported(null)}>
                  {t('customChar.cancel')}
                </Button>
                <Button
                  color="success"
                  onClick={() => {
                    const byKey = new Map(
                      imported.map((i) => [i.def.key, i.def])
                    )
                    const firstNew = imported.find((i) => i.isNew)?.def.key
                    saveAndReload(
                      [
                        ...defs.map((d) => byKey.get(d.key) ?? d),
                        ...imported.filter((i) => i.isNew).map((i) => i.def),
                      ],
                      imported.length === 1 ? firstNew : undefined
                    )
                  }}
                >
                  {t('customChar.importConfirm')}
                </Button>
              </Box>
            </>
          ) : (
            <>
              {defs.length === 0 && (
                <Typography color="text.secondary">
                  {t('customChar.empty')}
                </Typography>
              )}
              {defs.map((def) => (
                <CardThemed bgt="light" key={def.key}>
                  <CardContent
                    sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <ImgIcon
                      src={characterAsset(
                        def.template as CharacterKey,
                        'iconSide'
                      )}
                      size={3}
                    />
                    <Box flexGrow={1}>
                      <Typography variant="h6">
                        <ElementIcon
                          ele={def.ele}
                          iconProps={iconInlineProps}
                        />{' '}
                        {def.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {isCustomCharacterDataDef(def)
                          ? t('customChar.importedFrom', {
                              name: t(`charNames_gen:${def.template}`),
                            })
                          : t('customChar.basedOn', {
                              name: t(`charNames_gen:${def.template}`),
                            })}
                      </Typography>
                    </Box>
                    <Button
                      startIcon={<EditIcon />}
                      onClick={() =>
                        isCustomCharacterDataDef(def)
                          ? setDataEdit(def)
                          : setForm(formFromDef(def))
                      }
                    >
                      {t('customChar.edit')}
                    </Button>
                    <Button
                      color="error"
                      startIcon={<DeleteForeverIcon />}
                      onClick={() => onDelete(def)}
                    >
                      {t('customChar.delete')}
                    </Button>
                  </CardContent>
                </CardThemed>
              ))}
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button
                  sx={{ flexGrow: 1 }}
                  color="info"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    setForm(emptyForm(nextCustomCharacterKey(defs)))
                  }
                >
                  {t('customChar.create')}
                </Button>
                <Button
                  sx={{ flexGrow: 1 }}
                  color="primary"
                  startIcon={<FileUploadIcon />}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('customChar.import')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={onFile}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {t('customChar.importHelp')}
              </Typography>
            </>
          )}
        </CardContent>
      </CardThemed>
    </ModalWrapper>
  )
}

function CustomCharacterForm({
  form,
  setForm,
  onCancel,
  onSave,
}: {
  form: FormState
  setForm: (form: FormState) => void
  onCancel: () => void
  onSave: (def: CustomCharacterDef) => void
}) {
  const { t } = useTranslation(['page_character', 'charNames_gen'])
  const { t: tk } = useTranslation('statKey_gen')
  const options = useMemo(() => templateKeys(), [])
  const set = (partial: Partial<FormState>) => setForm({ ...form, ...partial })

  const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
  const hp = num(form.hp)
  const atk = num(form.atk)
  const def = num(form.def)
  const ascValue = num(form.ascValue)
  const valid =
    !!form.template &&
    [hp, atk, def, ascValue].every((n) => Number.isFinite(n) && n >= 0)

  const save = () => {
    if (!valid || !form.template) return
    onSave({
      key: form.key,
      name: form.name.trim() || t(`charNames_gen:${form.template}`),
      template: form.template,
      ele: form.ele,
      weaponType: form.weaponType,
      rarity: form.rarity,
      hp,
      atk,
      def,
      ascStat: form.ascStat,
      ascValue: isPercentStat(form.ascStat) ? ascValue / 100 : ascValue,
    })
  }

  const numberField = (field: 'hp' | 'atk' | 'def', label: string) => (
    <TextField
      fullWidth
      type="number"
      label={label}
      value={form[field]}
      onChange={(e) => set({ [field]: e.target.value })}
      error={!Number.isFinite(num(form[field]))}
      inputProps={{ min: 0, step: 'any' }}
    />
  )

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Autocomplete
        options={options}
        value={form.template}
        onChange={(_, template) =>
          template
            ? setForm(formFromTemplate(template, form))
            : set({ template })
        }
        getOptionLabel={(key) => t(`charNames_gen:${key}`)}
        renderOption={(props, key) => (
          <Box
            component="li"
            {...props}
            key={key}
            sx={{ display: 'flex', gap: 1 }}
          >
            <ImgIcon src={characterAsset(key, 'iconSide')} size={2} />
            {t(`charNames_gen:${key}`)}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('customChar.template')}
            helperText={t('customChar.templateHelp')}
          />
        )}
      />
      <TextField
        label={t('customChar.name')}
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder={
          form.template ? t(`charNames_gen:${form.template}`) : undefined
        }
      />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            label={t('customChar.element')}
            value={form.ele}
            onChange={(e) => set({ ele: e.target.value as ElementKey })}
          >
            {allElementKeys.map((ele) => (
              <MenuItem key={ele} value={ele}>
                <ElementIcon ele={ele} iconProps={iconInlineProps} />
                &nbsp;{capitalize(ele)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            label={t('customChar.weaponType')}
            value={form.weaponType}
            onChange={(e) =>
              set({ weaponType: e.target.value as WeaponTypeKey })
            }
          >
            {allWeaponTypeKeys.map((wt) => (
              <MenuItem key={wt} value={wt}>
                <ImgIcon src={imgAssets.weaponTypes[wt]} />
                &nbsp;{capitalize(wt)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            label={t('customChar.rarity')}
            value={form.rarity}
            onChange={(e) => set({ rarity: Number(e.target.value) as 4 | 5 })}
          >
            <MenuItem value={5}>5★</MenuItem>
            <MenuItem value={4}>4★</MenuItem>
          </TextField>
        </Grid>
      </Grid>
      <Typography variant="subtitle1">{t('customChar.baseStats')}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          {numberField('hp', tk('hp'))}
        </Grid>
        <Grid item xs={12} sm={4}>
          {numberField('atk', tk('atk'))}
        </Grid>
        <Grid item xs={12} sm={4}>
          {numberField('def', tk('def'))}
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField
            select
            fullWidth
            label={t('customChar.ascStat')}
            value={form.ascStat}
            onChange={(e) =>
              set({ ascStat: e.target.value as CustomCharacterAscStatKey })
            }
          >
            {customCharacterAscStatKeys.map((stat) => (
              <MenuItem key={stat} value={stat}>
                <ArtifactIconStatWithUnit statKey={stat} />
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            type="number"
            label={t('customChar.ascValue')}
            value={form.ascValue}
            onChange={(e) => set({ ascValue: e.target.value })}
            error={!Number.isFinite(num(form.ascValue))}
            inputProps={{ min: 0, step: 'any' }}
            InputProps={
              isPercentStat(form.ascStat)
                ? {
                    endAdornment: (
                      <InputAdornment position="end">%</InputAdornment>
                    ),
                  }
                : undefined
            }
          />
        </Grid>
      </Grid>
      <Box display="flex" gap={1} justifyContent="flex-end">
        <Button color="secondary" onClick={onCancel}>
          {t('customChar.cancel')}
        </Button>
        <Button color="success" disabled={!valid} onClick={save}>
          {t('customChar.save')}
        </Button>
      </Box>
    </Box>
  )
}
