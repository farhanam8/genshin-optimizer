import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import { CardThemed } from '@genshin-optimizer/common/ui'
import type {
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterBuffStat,
  CustomCharacterDataDef,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import {
  allElementKeys,
  customCharacterBuffSources,
  customCharacterBuffStats,
  validateCustomCharacterBuff,
} from '@genshin-optimizer/gi/consts'
import { KeyMap } from '@genshin-optimizer/gi/keymap'
import { ElementIcon } from '@genshin-optimizer/gi/svgicons'
import AddIcon from '@mui/icons-material/Add'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import {
  Box,
  Button,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

/** A buff as edited: numbers as typed, percentages in % */
export type BuffRow = {
  source: CustomCharacterBuffSource
  stat: CustomCharacterBuffStat
  value: string
  target: 'self' | 'team'
  scalingStat: '' | 'atk' | 'hp' | 'def' | 'eleMas'
  scalingPer: string
  max: string
  condition: string
  eles: ElementKey[]
  excludeEles: boolean
}

const isPercentStat = (stat: string) => stat.endsWith('_')
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
const show = (n: number) => `${+n.toFixed(6)}`
/** % to fraction without float noise: 0.7 -> 0.007, not 0.006999999999999999 */
const fromPercent = (n: number) => Number((n / 100).toPrecision(12))

export function buffToRow(b: CustomCharacterBuff): BuffRow {
  const pct = isPercentStat(b.stat)
  return {
    source: b.source,
    stat: b.stat,
    value: show(pct ? b.value * 100 : b.value),
    target: b.target,
    scalingStat: b.scaling?.stat ?? '',
    scalingPer: b.scaling ? show(b.scaling.per) : '100',
    max: b.max === undefined ? '' : show(pct ? b.max * 100 : b.max),
    condition: b.condition ?? '',
    eles: b.eles ?? [],
    excludeEles: !!b.excludeEles,
  }
}

/** The buff a row describes, or `undefined` if a number is invalid. */
export function rowToBuff(r: BuffRow): CustomCharacterBuff | undefined {
  const pct = isPercentStat(r.stat)
  const value = num(r.value)
  if (!Number.isFinite(value)) return undefined
  const max = r.max.trim() === '' ? undefined : num(r.max)
  if (max !== undefined && !Number.isFinite(max)) return undefined
  const per = num(r.scalingPer)
  if (r.scalingStat && !(Number.isFinite(per) && per > 0)) return undefined
  return validateCustomCharacterBuff({
    source: r.source,
    stat: r.stat,
    value: pct ? fromPercent(value) : value,
    target: r.target,
    scaling: r.scalingStat ? { stat: r.scalingStat, per } : undefined,
    max: max === undefined ? undefined : pct ? fromPercent(max) : max,
    condition: r.condition,
    eles: r.target === 'team' ? r.eles : undefined,
    excludeEles: r.excludeEles,
  })
}

const newRow = (): BuffRow => ({
  source: 'passive1',
  stat: 'atk_',
  value: '',
  target: 'team',
  scalingStat: '',
  scalingPer: '100',
  max: '',
  condition: '',
  eles: [],
  excludeEles: false,
})

/** Labels like "A1 · The Radiant Reign of Night" for each buff source. */
function sourceLabels(def: CustomCharacterDataDef) {
  const name = (t?: { name: string }) => (t?.name ? ` · ${t.name}` : '')
  return {
    passive1: `A1${name(def.passive1)}`,
    passive2: `A4${name(def.passive2)}`,
    passive3: `P3${name(def.passive3)}`,
    passive: `P4${name(def.otherPassives?.[0])}`,
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((i) => [
        `constellation${i}`,
        `C${i}${name(def.constellations[i - 1])}`,
      ])
    ),
  } as Record<CustomCharacterBuffSource, string>
}

/**
 * Edits the buffs of an imported custom character: which passive or
 * constellation gives them, the stat and value, who receives them, and an
 * optional toggle, ATK/HP/DEF/EM scaling, cap and element filter.
 */
export function CustomCharacterBuffEditor({
  def,
  rows,
  setRows,
}: {
  def: CustomCharacterDataDef
  rows: BuffRow[]
  setRows: (rows: BuffRow[]) => void
}) {
  const { t } = useTranslation('page_character')
  const sources = sourceLabels(def)
  const update = (i: number, partial: Partial<BuffRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...partial } : r)))

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {rows.map((r, i) => {
        const pct = isPercentStat(r.stat)
        const percentAdornment = pct
          ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
          : undefined
        const invalid = !rowToBuff(r)
        return (
          <CardThemed bgt="light" key={i}>
            <CardContent>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.buff.source')}
                    value={r.source}
                    onChange={(e) =>
                      update(i, {
                        source: e.target.value as CustomCharacterBuffSource,
                      })
                    }
                  >
                    {customCharacterBuffSources.map((s) => (
                      <MenuItem key={s} value={s}>
                        {sources[s]}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.buff.stat')}
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
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label={
                      r.scalingStat
                        ? t('customChar.buff.valuePer', {
                            per: r.scalingPer,
                            stat: KeyMap.get(r.scalingStat),
                          })
                        : t('customChar.buff.value')
                    }
                    value={r.value}
                    error={!Number.isFinite(num(r.value))}
                    onChange={(e) => update(i, { value: e.target.value })}
                    InputProps={percentAdornment}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.buff.target')}
                    value={r.target}
                    onChange={(e) =>
                      update(i, {
                        target: e.target.value as 'self' | 'team',
                      })
                    }
                  >
                    <MenuItem value="self">
                      {t('customChar.buff.targetSelf')}
                    </MenuItem>
                    <MenuItem value="team">
                      {t('customChar.buff.targetTeam')}
                    </MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.buff.condition')}
                    placeholder={t('customChar.buff.conditionPlaceholder')}
                    value={r.condition}
                    onChange={(e) => update(i, { condition: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.buff.scaling')}
                    value={r.scalingStat}
                    onChange={(e) =>
                      update(i, {
                        scalingStat: e.target.value as BuffRow['scalingStat'],
                      })
                    }
                  >
                    <MenuItem value="">
                      {t('customChar.buff.noScaling')}
                    </MenuItem>
                    {(['atk', 'hp', 'def', 'eleMas'] as const).map((s) => (
                      <MenuItem key={s} value={s}>
                        {KeyMap.get(s)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    disabled={!r.scalingStat}
                    label={t('customChar.buff.per')}
                    value={r.scalingPer}
                    error={!!r.scalingStat && !(num(r.scalingPer) > 0)}
                    onChange={(e) => update(i, { scalingPer: e.target.value })}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.buff.max')}
                    value={r.max}
                    error={r.max.trim() !== '' && !Number.isFinite(num(r.max))}
                    onChange={(e) => update(i, { max: e.target.value })}
                    InputProps={percentAdornment}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>
                <Grid item xs={6} md={2} textAlign="right">
                  <IconButton
                    color="error"
                    aria-label={t('customChar.buff.remove')}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    <DeleteForeverIcon />
                  </IconButton>
                </Grid>
                {r.target === 'team' && (
                  <Grid item xs={12}>
                    <Box
                      display="flex"
                      gap={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="body2" color="text.secondary">
                        {t('customChar.buff.elements')}
                      </Typography>
                      {allElementKeys.map((e) => (
                        <FormControlLabel
                          key={e}
                          sx={{ mr: 0.5 }}
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
                          label={
                            <ElementIcon ele={e} iconProps={iconInlineProps} />
                          }
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
                        label={t('customChar.buff.excludeEles')}
                      />
                    </Box>
                  </Grid>
                )}
                {invalid && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="error">
                      {t('customChar.buff.invalid')}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </CardThemed>
        )
      })}
      <Button
        startIcon={<AddIcon />}
        onClick={() => setRows([...rows, newRow()])}
      >
        {t('customChar.buff.add')}
      </Button>
    </Box>
  )
}
