import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import { CardThemed } from '@genshin-optimizer/common/ui'
import type {
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterBuffStat,
  CustomCharacterBuffTarget,
  CustomCharacterDataDef,
  CustomCharacterRowEffect,
  CustomCharacterTalentKey,
  ElementKey,
} from '@genshin-optimizer/gi/consts'
import {
  allElementKeys,
  customCharacterBuffSources,
  customCharacterBuffStats,
  customCharacterRowLabels,
  customCharacterTalentKeys,
  validateCustomCharacterBuff,
  validateCustomCharacterRowEffect,
} from '@genshin-optimizer/gi/consts'
import { KeyMap } from '@genshin-optimizer/gi/keymap'
import { ElementIcon } from '@genshin-optimizer/gi/svgicons'
import AddIcon from '@mui/icons-material/Add'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import EditIcon from '@mui/icons-material/Edit'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
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
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** A buff as edited: numbers as typed, percentages in % */
export type BuffRow = {
  source: CustomCharacterBuffSource
  stat: CustomCharacterBuffStat
  value: string
  target: CustomCharacterBuffTarget
  scalingStat: '' | 'atk' | 'hp' | 'def' | 'eleMas'
  scalingPer: string
  max: string
  condition: string
  conditionState: string
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
    conditionState: b.conditionState ?? '',
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
    conditionState: r.conditionState,
    eles: r.target === 'self' ? undefined : r.eles,
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
  conditionState: '',
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

const sourceShort = (s: CustomCharacterBuffSource) =>
  s === 'passive1'
    ? 'A1'
    : s === 'passive2'
      ? 'A4'
      : s === 'passive3'
        ? 'P3'
        : s === 'passive'
          ? 'P4'
          : `C${s.slice(-1)}`

/**
 * One line per item, opened for editing on click: an editor with all items
 * open at once mounts too many inputs (each buff has about 20) and takes
 * seconds to render.
 */
function SummaryRow({
  text,
  detail,
  invalid,
  onOpen,
  onRemove,
  openLabel,
  removeLabel,
}: {
  text: ReactNode
  detail?: ReactNode
  invalid: boolean
  onOpen: () => void
  onRemove: () => void
  openLabel: string
  removeLabel: string
}) {
  return (
    <CardThemed bgt="light">
      <Box display="flex" alignItems="center" gap={1} px={2} py={0.5}>
        <Box flexGrow={1} sx={{ cursor: 'pointer' }} onClick={onOpen}>
          <Typography variant="body2" color={invalid ? 'error' : undefined}>
            {text}
          </Typography>
          {detail && (
            <Typography variant="caption" color="text.secondary">
              {detail}
            </Typography>
          )}
        </Box>
        <IconButton size="small" aria-label={openLabel} onClick={onOpen}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <DeleteForeverIcon fontSize="small" />
        </IconButton>
      </Box>
    </CardThemed>
  )
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
  const [open, setOpen] = useState<number | null>(null)
  const update = (i: number, partial: Partial<BuffRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...partial } : r)))
  const remove = (i: number) => {
    setRows(rows.filter((_, j) => j !== i))
    setOpen(null)
  }
  const targetLabel = {
    self: t('customChar.buff.targetSelf'),
    team: t('customChar.buff.targetTeam'),
    others: t('customChar.buff.targetOthers'),
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {rows.map((r, i) => {
        if (open !== i) {
          const unit = isPercentStat(r.stat) ? '%' : ''
          const scaling = r.scalingStat
            ? ` / ${r.scalingPer} ${KeyMap.get(r.scalingStat)}`
            : ''
          const max = r.max.trim() ? ` (max ${r.max}${unit})` : ''
          const eles =
            r.target !== 'self' && r.eles.length
              ? ` (${r.excludeEles ? '≠ ' : ''}${r.eles.join('/')})`
              : ''
          const cond = r.condition
            ? ` · ${r.condition}${r.conditionState ? `: ${r.conditionState}` : ''}`
            : ''
          return (
            <SummaryRow
              key={i}
              text={`${sourceShort(r.source)} · ${KeyMap.get(r.stat)} ${r.value}${unit}${scaling}${max} · ${targetLabel[r.target]}${eles}${cond}`}
              invalid={!rowToBuff(r)}
              onOpen={() => setOpen(i)}
              onRemove={() => remove(i)}
              openLabel={t('customChar.buff.edit')}
              removeLabel={t('customChar.buff.remove')}
            />
          )
        }
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
                        target: e.target.value as CustomCharacterBuffTarget,
                      })
                    }
                  >
                    <MenuItem value="self">
                      {t('customChar.buff.targetSelf')}
                    </MenuItem>
                    <MenuItem value="team">
                      {t('customChar.buff.targetTeam')}
                    </MenuItem>
                    <MenuItem value="others">
                      {t('customChar.buff.targetOthers')}
                    </MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.buff.condition')}
                    placeholder={t('customChar.buff.conditionPlaceholder')}
                    value={r.condition}
                    onChange={(e) => update(i, { condition: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    disabled={!r.condition.trim()}
                    label={t('customChar.buff.conditionState')}
                    placeholder={t('customChar.buff.conditionStatePlaceholder')}
                    value={r.conditionState}
                    onChange={(e) =>
                      update(i, { conditionState: e.target.value })
                    }
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
                <Grid item xs={6} md={1}>
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
                <Grid item xs={6} md={1} textAlign="right">
                  <IconButton
                    aria-label={t('customChar.buff.close')}
                    onClick={() => setOpen(null)}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    aria-label={t('customChar.buff.remove')}
                    onClick={() => remove(i)}
                  >
                    <DeleteForeverIcon />
                  </IconButton>
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
        onClick={() => {
          setRows([...rows, newRow()])
          setOpen(rows.length)
        }}
      >
        {t('customChar.buff.add')}
      </Button>
    </Box>
  )
}

/** A row effect as edited: numbers as typed, `value` in % */
export type RowEffectRow = {
  source: CustomCharacterBuffSource
  kind: 'multiplier' | 'extraHit'
  talent: '' | CustomCharacterTalentKey
  match: string
  value: string
  name: string
  condition: string
  conditionState: string
  bonuses: { stat: CustomCharacterBuffStat; value: string }[]
}

export function rowEffectToRow(e: CustomCharacterRowEffect): RowEffectRow {
  return {
    source: e.source,
    kind: e.kind,
    talent: e.talent ?? '',
    match: e.match,
    value: show(e.value * 100),
    name: e.name ?? '',
    condition: e.condition ?? '',
    conditionState: e.conditionState ?? '',
    bonuses: (e.bonuses ?? []).map((b) => ({
      stat: b.stat,
      value: show(isPercentStat(b.stat) ? b.value * 100 : b.value),
    })),
  }
}

export function rowToRowEffect(
  r: RowEffectRow
): CustomCharacterRowEffect | undefined {
  const value = num(r.value)
  if (!Number.isFinite(value) || value < 0) return undefined
  const bonuses = r.bonuses.map((b) => ({
    stat: b.stat,
    value: isPercentStat(b.stat) ? fromPercent(num(b.value)) : num(b.value),
  }))
  if (bonuses.some((b) => !Number.isFinite(b.value))) return undefined
  return validateCustomCharacterRowEffect({
    source: r.source,
    kind: r.kind,
    talent: r.talent || undefined,
    match: r.match,
    value: fromPercent(value),
    name: r.name,
    condition: r.condition,
    conditionState: r.conditionState,
    bonuses,
  })
}

const newEffectRow = (): RowEffectRow => ({
  source: 'constellation2',
  kind: 'multiplier',
  talent: '',
  match: '',
  value: '100',
  name: '',
  condition: '',
  conditionState: '',
  bonuses: [],
})

/** Names of the talent values an effect applies to, as in the sheet. */
function matchedNames(def: CustomCharacterDataDef, r: RowEffectRow): string[] {
  let re: RegExp
  try {
    if (!r.match.trim()) return []
    re = new RegExp(r.match, 'i')
  } catch {
    return []
  }
  return customCharacterTalentKeys.flatMap((tk) =>
    r.talent && r.talent !== tk
      ? []
      : def.talents[tk].rows.flatMap((row) =>
          customCharacterRowLabels(row).filter(
            (label) => /DMG/i.test(label) && re.test(label)
          )
        )
  )
}

/**
 * Edits effects on talent values: DMG multipliers ("deals 125% of its
 * original DMG") and extra hits copying talent values ("deals 250% of its
 * original DMG", with stat bonuses for that hit only).
 */
export function CustomCharacterRowEffectEditor({
  def,
  rows,
  setRows,
}: {
  def: CustomCharacterDataDef
  rows: RowEffectRow[]
  setRows: (rows: RowEffectRow[]) => void
}) {
  const { t } = useTranslation('page_character')
  const sources = sourceLabels(def)
  const [open, setOpen] = useState<number | null>(null)
  const update = (i: number, partial: Partial<RowEffectRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...partial } : r)))
  const remove = (i: number) => {
    setRows(rows.filter((_, j) => j !== i))
    setOpen(null)
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {rows.map((r, i) => {
        const matched = matchedNames(def, r)
        if (open !== i) {
          const cond = r.condition
            ? ` · ${r.condition}${r.conditionState ? `: ${r.conditionState}` : ''}`
            : ''
          const kind =
            r.kind === 'multiplier'
              ? t('customChar.effect.multiplier')
              : t('customChar.effect.extraHit')
          return (
            <SummaryRow
              key={i}
              text={`${sourceShort(r.source)} · ${kind} ${r.value}% · ${r.name || r.match}${cond}`}
              detail={
                matched.length
                  ? t('customChar.effect.matched', {
                      count: matched.length,
                      names: matched.join(', '),
                    })
                  : t('customChar.effect.noMatch')
              }
              invalid={!rowToRowEffect(r) || !matched.length}
              onOpen={() => setOpen(i)}
              onRemove={() => remove(i)}
              openLabel={t('customChar.buff.edit')}
              removeLabel={t('customChar.buff.remove')}
            />
          )
        }
        const invalid = !rowToRowEffect(r)
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
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.effect.kind')}
                    value={r.kind}
                    onChange={(e) =>
                      update(i, {
                        kind: e.target.value as RowEffectRow['kind'],
                      })
                    }
                  >
                    <MenuItem value="multiplier">
                      {t('customChar.effect.multiplier')}
                    </MenuItem>
                    <MenuItem value="extraHit">
                      {t('customChar.effect.extraHit')}
                    </MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={t('customChar.effect.talent')}
                    value={r.talent}
                    onChange={(e) =>
                      update(i, {
                        talent: e.target.value as RowEffectRow['talent'],
                      })
                    }
                  >
                    <MenuItem value="">
                      {t('customChar.effect.anyTalent')}
                    </MenuItem>
                    {customCharacterTalentKeys.map((tk) => (
                      <MenuItem key={tk} value={tk}>
                        {def.talents[tk].name || tk}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.effect.match')}
                    placeholder="Doom|Evernight"
                    value={r.match}
                    error={!!r.match && !matched.length}
                    onChange={(e) => update(i, { match: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.effect.value')}
                    value={r.value}
                    error={!(num(r.value) >= 0)}
                    onChange={(e) => update(i, { value: e.target.value })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">%</InputAdornment>
                      ),
                    }}
                    inputProps={{ inputMode: 'decimal' }}
                  />
                </Grid>
                <Grid item xs={6} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.effect.name')}
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('customChar.buff.condition')}
                    placeholder={t('customChar.buff.conditionPlaceholder')}
                    value={r.condition}
                    onChange={(e) => update(i, { condition: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    disabled={!r.condition.trim()}
                    label={t('customChar.buff.conditionState')}
                    placeholder={t('customChar.buff.conditionStatePlaceholder')}
                    value={r.conditionState}
                    onChange={(e) =>
                      update(i, { conditionState: e.target.value })
                    }
                  />
                </Grid>
                <Grid item xs={12} md={1} textAlign="right">
                  <IconButton
                    aria-label={t('customChar.buff.close')}
                    onClick={() => setOpen(null)}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    aria-label={t('customChar.buff.remove')}
                    onClick={() => remove(i)}
                  >
                    <DeleteForeverIcon />
                  </IconButton>
                </Grid>
                {r.kind === 'extraHit' && (
                  <Grid item xs={12}>
                    <Box
                      display="flex"
                      gap={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="body2" color="text.secondary">
                        {t('customChar.effect.bonuses')}
                      </Typography>
                      {r.bonuses.map((b, j) => (
                        <Box
                          key={j}
                          display="flex"
                          gap={0.5}
                          alignItems="center"
                        >
                          <TextField
                            select
                            size="small"
                            value={b.stat}
                            onChange={(e) =>
                              update(i, {
                                bonuses: r.bonuses.map((x, k) =>
                                  k === j
                                    ? {
                                        ...x,
                                        stat: e.target
                                          .value as CustomCharacterBuffStat,
                                      }
                                    : x
                                ),
                              })
                            }
                          >
                            {customCharacterBuffStats.map((s) => (
                              <MenuItem key={s} value={s}>
                                {KeyMap.get(s)}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            size="small"
                            sx={{ width: 100 }}
                            value={b.value}
                            error={!Number.isFinite(num(b.value))}
                            onChange={(e) =>
                              update(i, {
                                bonuses: r.bonuses.map((x, k) =>
                                  k === j ? { ...x, value: e.target.value } : x
                                ),
                              })
                            }
                            InputProps={
                              isPercentStat(b.stat)
                                ? {
                                    endAdornment: (
                                      <InputAdornment position="end">
                                        %
                                      </InputAdornment>
                                    ),
                                  }
                                : undefined
                            }
                          />
                          <IconButton
                            size="small"
                            aria-label={t('customChar.buff.remove')}
                            onClick={() =>
                              update(i, {
                                bonuses: r.bonuses.filter((_, k) => k !== j),
                              })
                            }
                          >
                            <DeleteForeverIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() =>
                          update(i, {
                            bonuses: [
                              ...r.bonuses,
                              { stat: 'critDMG_', value: '' },
                            ],
                          })
                        }
                      >
                        {t('customChar.effect.addBonus')}
                      </Button>
                    </Box>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <Typography
                    variant="body2"
                    color={matched.length ? 'text.secondary' : 'error'}
                  >
                    {matched.length
                      ? t('customChar.effect.matched', {
                          count: matched.length,
                          names: matched.join(', '),
                        })
                      : t('customChar.effect.noMatch')}
                  </Typography>
                </Grid>
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
        onClick={() => {
          setRows([...rows, newEffectRow()])
          setOpen(rows.length)
        }}
      >
        {t('customChar.effect.add')}
      </Button>
    </Box>
  )
}
