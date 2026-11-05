import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import { ImgIcon } from '@genshin-optimizer/common/ui'
import { characterAsset, imgAssets } from '@genshin-optimizer/gi/assets'
import { charCard } from '@genshin-optimizer/gi/char-cards'
import type {
  CharacterKey,
  CustomCharacterAscStatKey,
  CustomCharacterDataDef,
  CustomCharacterImageKey,
  CustomCharacterImages,
  CustomCharacterTalent,
  CustomCharacterTalentKey,
  ElementKey,
  WeaponTypeKey,
} from '@genshin-optimizer/gi/consts'
import {
  allElementKeys,
  allWeaponTypeKeys,
  customCharacterAscStatKeys,
  customCharacterImageKeys,
  customCharacterImagesFromExample,
  customCharacterRowLabels,
  customCharacterTalentKeys,
  isCustomCharacterImageUrl,
  isCustomCharacterKey,
  nonTravelerCharacterKeys,
} from '@genshin-optimizer/gi/consts'
import {
  getRefStatsFromData,
  scaleCustomCharacterStats,
} from '@genshin-optimizer/gi/stats'
import { ElementIcon } from '@genshin-optimizer/gi/svgicons'
import {
  Autocomplete,
  Box,
  Button,
  Grid,
  InputAdornment,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArtifactIconStatWithUnit } from '../artifact/ArtifactStatKeyDisplay'
import type { BuffRow, RowEffectRow } from './CustomCharacterBuffEditor'
import {
  buffToRow,
  CustomCharacterBuffEditor,
  CustomCharacterRowEffectEditor,
  rowEffectToRow,
  rowToBuff,
  rowToRowEffect,
} from './CustomCharacterBuffEditor'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isPercentStat = (stat: string) => stat.endsWith('_')
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
const valid = (n: number) => Number.isFinite(n) && n >= 0
/** Shows a value without float noise, e.g. 0.396193 * 100 -> "39.6193" */
const show = (n: number, digits = 4) => `${+n.toFixed(digits)}`
/** % to fraction without float noise: 39.6193 -> 0.396193 */
const fromPercent = (n: number) => Number((n / 100).toPrecision(12))

/** Existing (non-custom, non-Traveler) characters, for images. */
export function imageTemplateKeys(): CharacterKey[] {
  return (nonTravelerCharacterKeys as readonly string[]).filter(
    (key) => !isCustomCharacterKey(key)
  ) as CharacterKey[]
}

type ParamInfo = { label: string; percent: boolean }

/** A label and unit for each param of a talent, from the rows that use it. */
function paramInfos(talent: CustomCharacterTalent): ParamInfo[] {
  const infos: ParamInfo[] = talent.params.map((_, i) => ({
    label: `Param ${i + 1}`,
    percent: false,
  }))
  for (const row of talent.rows) {
    const labels = customCharacterRowLabels(row)
    row.params.forEach(({ index, format }, part) => {
      if (!infos[index]) return
      infos[index] = {
        label: labels[part] ?? row.label,
        percent: format.endsWith('P'),
      }
    })
  }
  return infos
}

type TalentStrings = Record<CustomCharacterTalentKey, string[][]>

/**
 * Edits an imported custom character: name, images, element, weapon type,
 * rarity, level 90 base stats, ascension stat and talent multipliers per level.
 */
export function CustomCharacterDataForm({
  def,
  onCancel,
  onSave,
}: {
  def: CustomCharacterDataDef
  onCancel: () => void
  onSave: (def: CustomCharacterDataDef) => void
}) {
  const { t } = useTranslation(['page_character', 'charNames_gen'])
  const { t: tk } = useTranslation('statKey_gen')
  const options = useMemo(() => imageTemplateKeys(), [])
  const infos = useMemo(
    () =>
      Object.fromEntries(
        customCharacterTalentKeys.map((k) => [k, paramInfos(def.talents[k])])
      ) as Record<CustomCharacterTalentKey, ParamInfo[]>,
    [def]
  )

  const ref = useMemo(() => getRefStatsFromData(def), [def])
  const [name, setName] = useState(def.name)
  const [template, setTemplate] = useState(def.template as CharacterKey)
  const [ele, setEle] = useState<ElementKey>(def.ele)
  const [weaponType, setWeaponType] = useState<WeaponTypeKey>(def.weaponType)
  const [rarity, setRarity] = useState<4 | 5>(def.rarity)
  const [stats, setStats] = useState(() => {
    const ascStat = (
      (customCharacterAscStatKeys as readonly string[]).includes(
        ref.ascStat ?? ''
      )
        ? ref.ascStat
        : 'critRate_'
    ) as CustomCharacterAscStatKey
    return {
      hp: show(ref.hp, 2),
      atk: show(ref.atk, 2),
      def: show(ref.def, 2),
      ascStat,
      ascValue: show(
        isPercentStat(ascStat) ? ref.ascValue * 100 : ref.ascValue,
        2
      ),
    }
  })
  const [params, setParams] = useState<TalentStrings>(
    () =>
      Object.fromEntries(
        customCharacterTalentKeys.map((k) => [
          k,
          def.talents[k].params.map((values, i) =>
            values.map((v) => show(infos[k][i]?.percent ? v * 100 : v))
          ),
        ])
      ) as TalentStrings
  )
  const [tab, setTab] = useState<CustomCharacterTalentKey>('auto')
  const [images, setImages] = useState<Record<CustomCharacterImageKey, string>>(
    () =>
      Object.fromEntries(
        customCharacterImageKeys.map((k) => [k, def.images?.[k] ?? ''])
      ) as Record<CustomCharacterImageKey, string>
  )
  const [exampleUrl, setExampleUrl] = useState('')
  const [buffRows, setBuffRows] = useState<BuffRow[]>(() =>
    (def.buffs ?? []).map(buffToRow)
  )
  const [effectRows, setEffectRows] = useState<RowEffectRow[]>(() =>
    (def.rowEffects ?? []).map(rowEffectToRow)
  )
  const imageValid = (url: string) => !url || isCustomCharacterImageUrl(url)
  const fromExample =
    def.imageNames && exampleUrl
      ? customCharacterImagesFromExample(def.imageNames, exampleUrl)
      : undefined
  /** What a slot shows when left empty: the image of the "Images from" character */
  const fallbackImage = (k: CustomCharacterImageKey) =>
    k === 'card' ? charCard(template, 'F') : characterAsset(template, k)

  const statNums = {
    hp: num(stats.hp),
    atk: num(stats.atk),
    def: num(stats.def),
    ascValue: num(stats.ascValue),
  }
  const paramsValid = customCharacterTalentKeys.every((k) =>
    params[k].every((row) => row.every((v) => valid(num(v))))
  )
  const canSave =
    Object.values(statNums).every(valid) &&
    paramsValid &&
    Object.values(images).every(imageValid) &&
    buffRows.every((r) => !!rowToBuff(r)) &&
    effectRows.every((r) => !!rowToRowEffect(r))

  const save = () => {
    if (!canSave) return
    const scaled = scaleCustomCharacterStats(def, {
      ...statNums,
      ascStat: stats.ascStat,
      ascValue: isPercentStat(stats.ascStat)
        ? fromPercent(statNums.ascValue)
        : statNums.ascValue,
    })
    const talents = Object.fromEntries(
      customCharacterTalentKeys.map((k) => [
        k,
        {
          ...def.talents[k],
          params: params[k].map((row, i) =>
            row.map((v) =>
              infos[k][i]?.percent ? fromPercent(num(v)) : num(v)
            )
          ),
        },
      ])
    ) as CustomCharacterDataDef['talents']
    onSave({
      ...def,
      name: name.trim() || def.name,
      template,
      ele,
      weaponType,
      rarity,
      ...scaled,
      talents,
      buffs: buffRows.flatMap((r) => {
        const buff = rowToBuff(r)
        return buff ? [buff] : []
      }),
      rowEffects: effectRows.flatMap((r) => {
        const effect = rowToRowEffect(r)
        return effect ? [effect] : []
      }),
      images: Object.fromEntries(
        Object.entries(images).filter(([, url]) => url.trim())
      ) as CustomCharacterImages,
    })
  }

  const setParam = (row: number, lvl: number, value: string) =>
    setParams((prev) => ({
      ...prev,
      [tab]: prev[tab].map((r, i) =>
        i === row ? r.map((v, j) => (j === lvl ? value : v)) : r
      ),
    }))

  const statField = (field: 'hp' | 'atk' | 'def', label: string) => (
    <TextField
      fullWidth
      type="number"
      label={label}
      value={stats[field]}
      onChange={(e) => setStats({ ...stats, [field]: e.target.value })}
      error={!valid(num(stats[field]))}
      inputProps={{ min: 0, step: 'any' }}
    />
  )

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <TextField
        label={t('customChar.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Autocomplete
        options={options}
        value={template}
        disableClearable
        onChange={(_, key) => setTemplate(key)}
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
        renderInput={(inputParams) => (
          <TextField
            {...inputParams}
            InputLabelProps={{ ...inputParams.InputLabelProps, shrink: true }}
            label={t('customChar.imageTemplate')}
            helperText={t('customChar.imageTemplateHelp')}
          />
        )}
      />
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            label={t('customChar.element')}
            value={ele}
            onChange={(e) => setEle(e.target.value as ElementKey)}
          >
            {allElementKeys.map((e) => (
              <MenuItem key={e} value={e}>
                <ElementIcon ele={e} iconProps={iconInlineProps} />
                &nbsp;{capitalize(e)}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            label={t('customChar.weaponType')}
            value={weaponType}
            onChange={(e) => setWeaponType(e.target.value as WeaponTypeKey)}
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
            value={rarity}
            onChange={(e) => setRarity(Number(e.target.value) as 4 | 5)}
          >
            <MenuItem value={5}>5★</MenuItem>
            <MenuItem value={4}>4★</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      <Typography variant="subtitle1">{t('customChar.images')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('customChar.imagesHelp')}
      </Typography>
      {def.imageNames && (
        <Box display="flex" gap={1} alignItems="flex-start">
          <TextField
            fullWidth
            size="small"
            label={t('customChar.exampleUrl')}
            placeholder="https://.../UI_AvatarIcon_Anastasya.webp"
            value={exampleUrl}
            onChange={(e) => setExampleUrl(e.target.value)}
            error={!!exampleUrl && !fromExample}
            helperText={t('customChar.exampleUrlHelp')}
          />
          <Button
            disabled={!fromExample}
            onClick={() =>
              fromExample && setImages({ ...images, ...fromExample })
            }
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('customChar.fillImages')}
          </Button>
        </Box>
      )}
      <Grid container spacing={1}>
        {customCharacterImageKeys.map((k) => (
          <Grid item xs={12} md={6} key={k}>
            <Box display="flex" gap={1} alignItems="center">
              <Box
                component="img"
                src={images[k] || fallbackImage(k)}
                alt=""
                sx={{
                  width: 40,
                  height: 40,
                  objectFit: 'contain',
                  flexShrink: 0,
                  opacity: images[k] ? 1 : 0.4,
                }}
              />
              <TextField
                fullWidth
                size="small"
                label={t(`customChar.imageSlots.${k}`)}
                value={images[k]}
                onChange={(e) => setImages({ ...images, [k]: e.target.value })}
                error={!imageValid(images[k])}
                placeholder={def.imageNames?.[k]}
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle1">{t('customChar.baseStats')}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          {statField('hp', tk('hp'))}
        </Grid>
        <Grid item xs={12} sm={4}>
          {statField('atk', tk('atk'))}
        </Grid>
        <Grid item xs={12} sm={4}>
          {statField('def', tk('def'))}
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField
            select
            fullWidth
            label={t('customChar.ascStat')}
            value={stats.ascStat}
            onChange={(e) =>
              setStats({
                ...stats,
                ascStat: e.target.value as CustomCharacterAscStatKey,
              })
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
            value={stats.ascValue}
            onChange={(e) => setStats({ ...stats, ascValue: e.target.value })}
            error={!valid(num(stats.ascValue))}
            inputProps={{ min: 0, step: 'any' }}
            InputProps={
              isPercentStat(stats.ascStat)
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

      <Typography variant="subtitle1">
        {t('customChar.talentMultipliers')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('customChar.talentMultipliersHelp')}
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        {customCharacterTalentKeys.map((k) => (
          <Tab key={k} value={k} label={def.talents[k].name || k} />
        ))}
      </Tabs>
      <Box sx={{ overflowX: 'auto', maxHeight: '50vh' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 220 }}>
                {t('customChar.param')}
              </TableCell>
              {params[tab][0]?.map((_, lvl) => (
                <TableCell key={lvl} align="center">
                  {t('customChar.level', { level: lvl + 1 })}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {params[tab].map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  {infos[tab][i]?.label}
                  {infos[tab][i]?.percent ? ' (%)' : ''}
                </TableCell>
                {row.map((v, lvl) => (
                  <TableCell key={lvl} sx={{ p: 0.5 }}>
                    <TextField
                      variant="standard"
                      size="small"
                      value={v}
                      error={!valid(num(v))}
                      onChange={(e) => setParam(i, lvl, e.target.value)}
                      inputProps={{
                        'aria-label': `${infos[tab][i]?.label} Lv. ${lvl + 1}`,
                        inputMode: 'decimal',
                        style: { width: 80, textAlign: 'right' },
                      }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Typography variant="subtitle1">{t('customChar.buffs')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('customChar.buffsHelp')}
      </Typography>
      <CustomCharacterBuffEditor
        def={def}
        rows={buffRows}
        setRows={setBuffRows}
      />

      <Typography variant="subtitle1">{t('customChar.effects')}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('customChar.effectsHelp')}
      </Typography>
      <CustomCharacterRowEffectEditor
        def={def}
        rows={effectRows}
        setRows={setEffectRows}
      />

      <Box display="flex" gap={1} justifyContent="flex-end">
        <Button color="secondary" onClick={onCancel}>
          {t('customChar.cancel')}
        </Button>
        <Button color="success" disabled={!canSave} onClick={save}>
          {t('customChar.save')}
        </Button>
      </Box>
    </Box>
  )
}
