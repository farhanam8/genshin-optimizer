import { CardThemed, ImgIcon, ModalWrapper } from '@genshin-optimizer/common/ui'
import { weaponAsset } from '@genshin-optimizer/gi/assets'
import type {
  CustomCharacterBuffStat,
  CustomCharacterBuffTarget,
  CustomWeaponBuff,
  CustomWeaponDef,
  CustomWeaponSubstat,
  ElementKey,
  WeaponKey,
} from '@genshin-optimizer/gi/consts'
import {
  allElementKeys,
  allWeaponKeys,
  customCharacterBuffStats,
  customCharacterImagesFromExample,
  customWeaponSubstats,
  isCustomCharacterImageUrl,
  isCustomWeaponKey,
  nextCustomWeaponKey,
  parseCustomWeaponPack,
  readCustomWeaponDefs,
  writeCustomWeaponDefs,
} from '@genshin-optimizer/gi/consts'
import { KeyMap } from '@genshin-optimizer/gi/keymap'
import {
  getWeaponRefStats,
  getWeaponStat,
  scaleCustomWeaponStats,
} from '@genshin-optimizer/gi/stats'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import EditIcon from '@mui/icons-material/Edit'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CardContent,
  CardHeader,
  Checkbox,
  Divider,
  FormControlLabel,
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

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
const isPct = (stat: string) => stat.endsWith('_')
const show = (n: number, digits = 4) => `${+n.toFixed(digits)}`
const fromPercent = (n: number) => Number((n / 100).toPrecision(12))

/** Existing (non-custom) weapons of a type, for images. */
function templateWeapons(def: Pick<CustomWeaponDef, 'weaponType'>) {
  return (allWeaponKeys as readonly string[]).filter(
    (k) =>
      !isCustomWeaponKey(k) &&
      getWeaponStat(k as WeaponKey).weaponType === def.weaponType
  ) as WeaponKey[]
}

/** An existing weapon to borrow images from: same type and rarity if possible. */
function pickTemplate(def: Pick<CustomWeaponDef, 'weaponType' | 'rarity'>) {
  const keys = templateWeapons(def)
  return (
    keys.find((k) => getWeaponStat(k).rarity === def.rarity) ??
    keys[0] ??
    (allWeaponKeys[0] as WeaponKey)
  )
}

type ImportItem = { def: CustomWeaponDef; isNew: boolean }

/** Weapons imported before (same source id) are updated, keeping their key, name and images. */
function importPack(
  json: string,
  defs: CustomWeaponDef[]
): { items: ImportItem[] } | { error: string } {
  const parsed = parseCustomWeaponPack(json)
  if ('error' in parsed) return parsed
  const all = [...defs]
  const items = parsed.weapons.map((w) => {
    const existing = all.find(
      (d) => d.sourceId !== undefined && d.sourceId === w.sourceId
    )
    const def: CustomWeaponDef = existing
      ? {
          ...w,
          key: existing.key,
          name: existing.name,
          template: existing.template,
          images: { ...w.images, ...existing.images },
          buffs: w.buffs ?? existing.buffs,
        }
      : { ...w, key: nextCustomWeaponKey(all), template: pickTemplate(w) }
    if (!existing) all.push(def)
    return { def, isNew: !existing }
  })
  return { items }
}

function saveAndReload(defs: CustomWeaponDef[]) {
  writeCustomWeaponDefs(defs)
  window.location.reload()
}

/**
 * Import, edit and delete custom weapons: weapons from a custom character pack
 * (see tools/custom-characters), with their own stats, passive and buffs.
 */
export function CustomWeaponModal({
  show,
  onHide,
}: {
  show: boolean
  onHide: () => void
}) {
  const { t } = useTranslation(['page_weapon', 'weaponNames_gen'])
  const [defs] = useState(() => readCustomWeaponDefs())
  const [edit, setEdit] = useState<CustomWeaponDef | null>(null)
  const [imported, setImported] = useState<ImportItem[] | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setEdit(null)
    setImported(null)
    setError('')
    onHide()
  }
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const result = importPack(await file.text(), defs)
    if ('error' in result) {
      setError(t(`customWeapon.importErrors.${result.error}`))
      setImported(null)
    } else {
      setError('')
      setImported(result.items)
    }
  }

  return (
    <ModalWrapper open={show} onClose={close}>
      <CardThemed>
        <CardHeader
          title={t('customWeapon.title')}
          action={
            <IconButton onClick={close}>
              <CloseIcon />
            </IconButton>
          }
        />
        <Divider />
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert severity="info">{t('customWeapon.info')}</Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {edit ? (
            <CustomWeaponForm
              def={edit}
              onCancel={() => setEdit(null)}
              onSave={(def) =>
                saveAndReload(defs.map((d) => (d.key === def.key ? def : d)))
              }
            />
          ) : imported ? (
            <>
              <Typography>{t('customWeapon.importPreview')}</Typography>
              {imported.map(({ def, isNew }) => (
                <CardThemed bgt="light" key={def.key}>
                  <CardContent
                    sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <ImgIcon
                      src={weaponAsset(def.template as WeaponKey)}
                      size={3}
                    />
                    <Box flexGrow={1}>
                      <Typography variant="h6">
                        {def.name} {'★'.repeat(def.rarity)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t(
                          isNew
                            ? 'customWeapon.importNew'
                            : 'customWeapon.importUpdate'
                        )}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardThemed>
              ))}
              <Box display="flex" gap={1} justifyContent="flex-end">
                <Button color="secondary" onClick={() => setImported(null)}>
                  {t('customWeapon.cancel')}
                </Button>
                <Button
                  color="success"
                  onClick={() => {
                    const byKey = new Map(
                      imported.map((i) => [i.def.key, i.def])
                    )
                    saveAndReload([
                      ...defs.map((d) => byKey.get(d.key) ?? d),
                      ...imported.filter((i) => i.isNew).map((i) => i.def),
                    ])
                  }}
                >
                  {t('customWeapon.importConfirm')}
                </Button>
              </Box>
            </>
          ) : (
            <>
              {defs.length === 0 && (
                <Typography color="text.secondary">
                  {t('customWeapon.empty')}
                </Typography>
              )}
              {defs.map((def) => (
                <CardThemed bgt="light" key={def.key}>
                  <CardContent
                    sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <ImgIcon src={weaponAsset(def.key as WeaponKey)} size={3} />
                    <Box flexGrow={1}>
                      <Typography variant="h6">
                        {def.name} {'★'.repeat(def.rarity)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('customWeapon.imagesFrom', {
                          name: t(`weaponNames_gen:${def.template}`),
                        })}
                      </Typography>
                    </Box>
                    <Button
                      startIcon={<EditIcon />}
                      onClick={() => setEdit(def)}
                    >
                      {t('customWeapon.edit')}
                    </Button>
                    <Button
                      color="error"
                      startIcon={<DeleteForeverIcon />}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('customWeapon.deleteConfirm', { name: def.name })
                          )
                        )
                          saveAndReload(defs.filter((d) => d.key !== def.key))
                      }}
                    >
                      {t('customWeapon.delete')}
                    </Button>
                  </CardContent>
                </CardThemed>
              ))}
              <Button
                color="primary"
                startIcon={<FileUploadIcon />}
                onClick={() => fileRef.current?.click()}
              >
                {t('customWeapon.import')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={onFile}
              />
              <Typography variant="body2" color="text.secondary">
                {t('customWeapon.importHelp')}
              </Typography>
            </>
          )}
        </CardContent>
      </CardThemed>
    </ModalWrapper>
  )
}

/** A buff as edited: values at R1..R5 as typed, percentages in % */
type BuffRow = {
  stat: CustomCharacterBuffStat
  values: string[]
  target: CustomCharacterBuffTarget
  condition: string
  conditionState: string
  eles: ElementKey[]
  excludeEles: boolean
}

const buffToRow = (b: CustomWeaponBuff): BuffRow => ({
  stat: b.stat,
  values: b.values.map((v) => show(isPct(b.stat) ? v * 100 : v)),
  target: b.target,
  condition: b.condition ?? '',
  conditionState: b.conditionState ?? '',
  eles: b.eles ?? [],
  excludeEles: !!b.excludeEles,
})

function rowToBuff(r: BuffRow): CustomWeaponBuff | undefined {
  const values = r.values.map((v) =>
    isPct(r.stat) ? fromPercent(num(v)) : num(v)
  )
  if (!values.every(Number.isFinite)) return undefined
  return {
    stat: r.stat,
    values,
    target: r.target,
    ...(r.condition.trim()
      ? {
          condition: r.condition.trim(),
          ...(r.conditionState.trim()
            ? { conditionState: r.conditionState.trim() }
            : {}),
        }
      : {}),
    ...(r.target !== 'self' && r.eles.length
      ? { eles: r.eles, ...(r.excludeEles ? { excludeEles: true } : {}) }
      : {}),
  }
}

function CustomWeaponForm({
  def,
  onCancel,
  onSave,
}: {
  def: CustomWeaponDef
  onCancel: () => void
  onSave: (def: CustomWeaponDef) => void
}) {
  const { t } = useTranslation(['page_weapon', 'weaponNames_gen'])
  const options = useMemo(() => templateWeapons(def), [def])
  const ref = useMemo(() => getWeaponRefStats(def.key as WeaponKey), [def])
  const [name, setName] = useState(def.name)
  const [passiveName, setPassiveName] = useState(def.passiveName)
  const [template, setTemplate] = useState(def.template as WeaponKey)
  const [rarity, setRarity] = useState(def.rarity)
  const [atk, setAtk] = useState(show(ref.atk, 2))
  const [subStat, setSubStat] = useState<CustomWeaponSubstat | ''>(
    def.subStat?.type ?? ''
  )
  const [subValue, setSubValue] = useState(
    show(isPct(subStat) ? ref.subValue * 100 : ref.subValue, 2)
  )
  const [images, setImages] = useState({
    icon: def.images?.icon ?? '',
    awakenIcon: def.images?.awakenIcon ?? '',
  })
  const [exampleUrl, setExampleUrl] = useState('')
  const fromExample =
    def.imageNames && exampleUrl
      ? customCharacterImagesFromExample(def.imageNames, exampleUrl)
      : undefined
  const [rows, setRows] = useState<BuffRow[]>(() =>
    (def.buffs ?? []).map(buffToRow)
  )
  const [open, setOpen] = useState<number | null>(null)
  const update = (i: number, partial: Partial<BuffRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...partial } : r)))

  const imageValid = (u: string) => !u || isCustomCharacterImageUrl(u)
  const valid =
    num(atk) >= 0 &&
    (!subStat || Number.isFinite(num(subValue))) &&
    imageValid(images.icon) &&
    imageValid(images.awakenIcon) &&
    rows.every((r) => !!rowToBuff(r))

  const save = () => {
    if (!valid) return
    const scaled = scaleCustomWeaponStats(
      { ...def, rarity },
      {
        atk: num(atk),
        subStat: subStat || undefined,
        subValue: subStat
          ? isPct(subStat)
            ? fromPercent(num(subValue))
            : num(subValue)
          : undefined,
      }
    )
    onSave({
      ...def,
      ...scaled,
      name: name.trim() || def.name,
      passiveName,
      template,
      rarity,
      images: Object.fromEntries(
        Object.entries(images).filter(([, u]) => u.trim())
      ),
      buffs: rows.flatMap((r) => {
        const b = rowToBuff(r)
        return b ? [b] : []
      }),
    })
  }

  const targetLabel = {
    self: t('customWeapon.buff.targetSelf'),
    team: t('customWeapon.buff.targetTeam'),
    others: t('customWeapon.buff.targetOthers'),
    active: t('customWeapon.buff.targetActive'),
  }

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label={t('customWeapon.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label={t('customWeapon.passiveName')}
            value={passiveName}
            onChange={(e) => setPassiveName(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <Autocomplete
            options={options}
            value={template}
            disableClearable
            onChange={(_, k) => setTemplate(k)}
            getOptionLabel={(k) => t(`weaponNames_gen:${k}`)}
            renderOption={(props, k) => (
              <Box
                component="li"
                {...props}
                key={k}
                sx={{ display: 'flex', gap: 1 }}
              >
                <ImgIcon src={weaponAsset(k)} size={2} />
                {t(`weaponNames_gen:${k}`)}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
                label={t('customWeapon.template')}
                helperText={t('customWeapon.templateHelp')}
              />
            )}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t('customWeapon.rarity')}
            value={rarity}
            onChange={(e) =>
              setRarity(Number(e.target.value) as CustomWeaponDef['rarity'])
            }
          >
            {[5, 4, 3, 2, 1].map((r) => (
              <MenuItem key={r} value={r}>
                {r}★
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Typography variant="subtitle1">{t('customWeapon.images')}</Typography>
      {def.imageNames && (
        <Box display="flex" gap={1} alignItems="flex-start">
          <TextField
            fullWidth
            size="small"
            label={t('customWeapon.exampleUrl')}
            value={exampleUrl}
            onChange={(e) => setExampleUrl(e.target.value)}
            error={!!exampleUrl && !fromExample}
            helperText={t('customWeapon.exampleUrlHelp')}
          />
          <Button
            disabled={!fromExample}
            sx={{ whiteSpace: 'nowrap' }}
            onClick={() =>
              fromExample &&
              setImages({
                icon: fromExample.icon ?? images.icon,
                awakenIcon: fromExample.awakenIcon ?? images.awakenIcon,
              })
            }
          >
            {t('customWeapon.fillImages')}
          </Button>
        </Box>
      )}
      <Grid container spacing={1}>
        {(['icon', 'awakenIcon'] as const).map((k) => (
          <Grid item xs={12} md={6} key={k}>
            <Box display="flex" gap={1} alignItems="center">
              <Box
                component="img"
                alt=""
                src={images[k] || weaponAsset(template, k === 'awakenIcon')}
                sx={{
                  width: 40,
                  height: 40,
                  objectFit: 'contain',
                  opacity: images[k] ? 1 : 0.4,
                }}
              />
              <TextField
                fullWidth
                size="small"
                label={t(`customWeapon.imageSlots.${k}`)}
                value={images[k]}
                placeholder={def.imageNames?.[k]}
                error={!imageValid(images[k])}
                onChange={(e) => setImages({ ...images, [k]: e.target.value })}
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle1">{t('customWeapon.stats')}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            label={KeyMap.get('atk')}
            value={atk}
            error={!(num(atk) >= 0)}
            onChange={(e) => setAtk(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label={t('customWeapon.subStat')}
            value={subStat}
            onChange={(e) =>
              setSubStat(e.target.value as CustomWeaponSubstat | '')
            }
          >
            <MenuItem value="">{t('customWeapon.noSubStat')}</MenuItem>
            {customWeaponSubstats.map((s) => (
              <MenuItem key={s} value={s}>
                {KeyMap.get(s)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            disabled={!subStat}
            label={t('customWeapon.subValue')}
            value={subValue}
            error={!!subStat && !Number.isFinite(num(subValue))}
            onChange={(e) => setSubValue(e.target.value)}
            InputProps={
              isPct(subStat)
                ? {
                    endAdornment: (
                      <InputAdornment position="end">%</InputAdornment>
                    ),
                  }
                : undefined
            }
            inputProps={{ inputMode: 'decimal' }}
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle1">{t('customWeapon.buffs')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('customWeapon.buffsHelp')}
      </Typography>
      {rows.map((r, i) => {
        const unit = isPct(r.stat) ? '%' : ''
        if (open !== i)
          return (
            <CardThemed bgt="light" key={i}>
              <Box display="flex" alignItems="center" gap={1} px={2} py={0.5}>
                <Typography
                  variant="body2"
                  flexGrow={1}
                  sx={{ cursor: 'pointer' }}
                  color={rowToBuff(r) ? undefined : 'error'}
                  onClick={() => setOpen(i)}
                >
                  {`${KeyMap.get(r.stat)} ${r.values.join('/')}${unit} · ${targetLabel[r.target]}${
                    r.target !== 'self' && r.eles.length
                      ? ` (${r.excludeEles ? '≠ ' : ''}${r.eles.join('/')})`
                      : ''
                  }${r.condition ? ` · ${r.condition}${r.conditionState ? `: ${r.conditionState}` : ''}` : ''}`}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={t('customWeapon.edit')}
                  onClick={() => setOpen(i)}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={t('customWeapon.buff.remove')}
                  onClick={() => {
                    setRows(rows.filter((_, j) => j !== i))
                    setOpen(null)
                  }}
                >
                  <DeleteForeverIcon fontSize="small" />
                </IconButton>
              </Box>
            </CardThemed>
          )
        return (
          <CardThemed bgt="light" key={i}>
            <CardContent>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} md={5}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customWeapon.buff.stat')}
                    value={r.stat}
                    onChange={(e) =>
                      update(i, {
                        stat: e.target.value as CustomCharacterBuffStat,
                      })
                    }
                  >
                    {customCharacterBuffStats.map((s) => (
                      <MenuItem key={s} value={s}>
                        {KeyMap.get(s)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customWeapon.buff.target')}
                    value={r.target}
                    onChange={(e) =>
                      update(i, {
                        target: e.target.value as CustomCharacterBuffTarget,
                      })
                    }
                  >
                    {(['self', 'team', 'others', 'active'] as const).map(
                      (k) => (
                        <MenuItem key={k} value={k}>
                          {targetLabel[k]}
                        </MenuItem>
                      )
                    )}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4} textAlign="right">
                  <IconButton
                    aria-label={t('customWeapon.buff.close')}
                    onClick={() => setOpen(null)}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    aria-label={t('customWeapon.buff.remove')}
                    onClick={() => {
                      setRows(rows.filter((_, j) => j !== i))
                      setOpen(null)
                    }}
                  >
                    <DeleteForeverIcon />
                  </IconButton>
                </Grid>
                {r.values.map((v, k) => (
                  <Grid item xs={4} md={2} key={k}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`R${k + 1}`}
                      value={v}
                      error={!Number.isFinite(num(v))}
                      onChange={(e) =>
                        update(i, {
                          values: r.values.map((x, j) =>
                            j === k ? e.target.value : x
                          ),
                        })
                      }
                      InputProps={
                        unit
                          ? {
                              endAdornment: (
                                <InputAdornment position="end">
                                  %
                                </InputAdornment>
                              ),
                            }
                          : undefined
                      }
                      inputProps={{ inputMode: 'decimal' }}
                    />
                  </Grid>
                ))}
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customWeapon.buff.condition')}
                    value={r.condition}
                    onChange={(e) => update(i, { condition: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    size="small"
                    disabled={!r.condition.trim()}
                    label={t('customWeapon.buff.conditionState')}
                    value={r.conditionState}
                    onChange={(e) =>
                      update(i, { conditionState: e.target.value })
                    }
                  />
                </Grid>
                {r.target !== 'self' && (
                  <Grid item xs={12}>
                    <Box
                      display="flex"
                      gap={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="body2" color="text.secondary">
                        {t('customWeapon.buff.elements')}
                      </Typography>
                      {allElementKeys.map((e) => (
                        <FormControlLabel
                          key={e}
                          control={
                            <Checkbox
                              size="small"
                              checked={r.eles.includes(e)}
                              onChange={(_, checked) =>
                                update(i, {
                                  eles: checked
                                    ? [...r.eles, e]
                                    : r.eles.filter((x) => x !== e),
                                })
                              }
                            />
                          }
                          label={e}
                        />
                      ))}
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            disabled={!r.eles.length}
                            checked={r.excludeEles}
                            onChange={(_, checked) =>
                              update(i, { excludeEles: checked })
                            }
                          />
                        }
                        label={t('customWeapon.buff.excludeEles')}
                      />
                    </Box>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </CardThemed>
        )
      })}
      <Button
        startIcon={<AddIcon />}
        onClick={() => {
          setRows([
            ...rows,
            {
              stat: 'atk_',
              values: ['', '', '', '', ''],
              target: 'self',
              condition: '',
              conditionState: '',
              eles: [],
              excludeEles: false,
            },
          ])
          setOpen(rows.length)
        }}
      >
        {t('customWeapon.buff.add')}
      </Button>

      <Box display="flex" gap={1} justifyContent="flex-end">
        <Button color="secondary" onClick={onCancel}>
          {t('customWeapon.cancel')}
        </Button>
        <Button color="success" disabled={!valid} onClick={save}>
          {t('customWeapon.save')}
        </Button>
      </Box>
    </Box>
  )
}
