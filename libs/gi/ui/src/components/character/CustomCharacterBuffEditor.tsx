import { iconInlineProps } from '@genshin-optimizer/common/svgicons'
import { CardThemed } from '@genshin-optimizer/common/ui'
import type {
  CustomCharacterAmount,
  CustomCharacterBuff,
  CustomCharacterBuffSource,
  CustomCharacterBuffStat,
  CustomCharacterBuffTarget,
  CustomCharacterCondition2,
  CustomCharacterDataDef,
  CustomCharacterRowEffect,
  CustomCharacterTalentKey,
  CustomCharacterTalentParam,
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

/**
 * The amount and second-toggle fields shared by buffs and bonus effects, as
 * edited. Talent rows are written "talent:index" ("burst:5"); with one, the
 * value is a multiplier of that row's value, not a percentage.
 */
type AmountRow = {
  value: string
  scalingStat: '' | 'atk' | 'hp' | 'def' | 'eleMas'
  scalingPer: string
  max: string
  talentParam: string
  maxTalentParam: string
  boostC: string
  boostFactor: string
  condition2: string
  conditionState2: string
}

/** A buff as edited: numbers as typed, percentages in % */
export type BuffRow = AmountRow & {
  source: CustomCharacterBuffSource
  stat: CustomCharacterBuffStat
  target: CustomCharacterBuffTarget
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

const paramKey = (p?: CustomCharacterTalentParam) =>
  p ? `${p.talent}:${p.index}` : ''
const parseParamKey = (k: string): CustomCharacterTalentParam | undefined => {
  const [talent, index] = k.split(':')
  return talent && index !== undefined
    ? { talent: talent as CustomCharacterTalentKey, index: Number(index) }
    : undefined
}

function amountToRow(
  a: Partial<CustomCharacterAmount> & CustomCharacterCondition2,
  stat: string
): AmountRow {
  const pct = isPercentStat(stat)
  const value = a.value ?? 0
  return {
    value: show(pct && !a.talentParam ? value * 100 : value),
    scalingStat: a.scaling?.stat ?? '',
    scalingPer: a.scaling ? show(a.scaling.per) : '100',
    max: a.max === undefined ? '' : show(pct ? a.max * 100 : a.max),
    talentParam: paramKey(a.talentParam),
    maxTalentParam: paramKey(a.maxTalentParam),
    boostC: a.boost ? `${a.boost.constellation}` : '',
    boostFactor: a.boost ? show(a.boost.factor) : '1',
    condition2: a.condition2 ?? '',
    conditionState2: a.conditionState2 ?? '',
  }
}

/** The amount fields of a row, or `undefined` if a number is invalid. */
function rowToAmount(
  r: AmountRow,
  stat: string
): (CustomCharacterAmount & CustomCharacterCondition2) | undefined {
  const pct = isPercentStat(stat)
  const talentParam = parseParamKey(r.talentParam)
  const value = num(r.value)
  if (!Number.isFinite(value)) return undefined
  const maxTalentParam = parseParamKey(r.maxTalentParam)
  const max = maxTalentParam || r.max.trim() === '' ? undefined : num(r.max)
  if (max !== undefined && !Number.isFinite(max)) return undefined
  const per = num(r.scalingPer)
  if (r.scalingStat && !(Number.isFinite(per) && per > 0)) return undefined
  const factor = num(r.boostFactor)
  if (r.boostC && !Number.isFinite(factor)) return undefined
  return {
    value: pct && !talentParam ? fromPercent(value) : value,
    ...(r.scalingStat ? { scaling: { stat: r.scalingStat, per } } : {}),
    ...(max !== undefined ? { max: pct ? fromPercent(max) : max } : {}),
    ...(talentParam ? { talentParam } : {}),
    ...(maxTalentParam ? { maxTalentParam } : {}),
    ...(r.boostC ? { boost: { constellation: Number(r.boostC), factor } } : {}),
    condition2: r.condition2,
    conditionState2: r.conditionState2,
  }
}

const newAmountRow = (): AmountRow => ({
  value: '',
  scalingStat: '',
  scalingPer: '100',
  max: '',
  talentParam: '',
  maxTalentParam: '',
  boostC: '',
  boostFactor: '1',
  condition2: '',
  conditionState2: '',
})

export function buffToRow(b: CustomCharacterBuff): BuffRow {
  return {
    ...amountToRow(b, b.stat),
    source: b.source,
    stat: b.stat,
    target: b.target,
    condition: b.condition ?? '',
    conditionState: b.conditionState ?? '',
    eles: b.eles ?? [],
    excludeEles: !!b.excludeEles,
  }
}

/** The buff a row describes, or `undefined` if a number is invalid. */
export function rowToBuff(r: BuffRow): CustomCharacterBuff | undefined {
  const amount = rowToAmount(r, r.stat)
  if (!amount) return undefined
  return validateCustomCharacterBuff({
    ...amount,
    source: r.source,
    stat: r.stat,
    target: r.target,
    condition: r.condition,
    conditionState: r.conditionState,
    eles: r.target === 'self' ? undefined : r.eles,
    excludeEles: r.excludeEles,
  })
}

const newRow = (): BuffRow => ({
  ...newAmountRow(),
  source: 'passive1',
  stat: 'atk_',
  target: 'team',
  condition: '',
  conditionState: '',
  eles: [],
  excludeEles: false,
})

/** Labels like "A1 · The Radiant Reign of Night" for each buff source. */
function sourceLabels(def: CustomCharacterDataDef) {
  const name = (t?: { name: string }) => (t?.name ? ` · ${t.name}` : '')
  return {
    skill: `E${name(def.talents.skill)}`,
    burst: `Q${name(def.talents.burst)}`,
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
  s === 'skill'
    ? 'E'
    : s === 'burst'
      ? 'Q'
      : s === 'passive1'
        ? 'A1'
        : s === 'passive2'
          ? 'A4'
          : s === 'passive3'
            ? 'P3'
            : s === 'passive'
              ? 'P4'
              : `C${s.slice(-1)}`

/** Talent rows that can give a buff's value or cap: "Burst · ATK Bonus Ratio" */
function talentParamOptions(def: CustomCharacterDataDef) {
  return customCharacterTalentKeys.flatMap((tk) =>
    def.talents[tk].rows.flatMap((row) => {
      const labels = customCharacterRowLabels(row)
      return row.params.map(({ index }, part) => ({
        key: `${tk}:${index}`,
        label: `${def.talents[tk].name || tk} · ${labels[part] ?? row.label}`,
      }))
    })
  )
}

/**
 * Value from a talent row, cap from a talent row, constellation multiplier
 * and second toggle: shared by buffs and bonus effects.
 */
function AdvancedAmountFields({
  def,
  row,
  update,
}: {
  def: CustomCharacterDataDef
  row: AmountRow
  update: (partial: Partial<AmountRow>) => void
}) {
  const { t } = useTranslation('page_character')
  const options = talentParamOptions(def)
  const paramSelect = (
    field: 'talentParam' | 'maxTalentParam',
    label: string
  ) => (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={row[field]}
      onChange={(e) => update({ [field]: e.target.value })}
    >
      <MenuItem value="">{t('customChar.buff.none')}</MenuItem>
      {options.map((o) => (
        <MenuItem key={o.key} value={o.key}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  )
  return (
    <Grid container spacing={1}>
      <Grid item xs={12} md={6}>
        {paramSelect('talentParam', t('customChar.buff.talentParam'))}
      </Grid>
      <Grid item xs={12} md={6}>
        {paramSelect('maxTalentParam', t('customChar.buff.maxTalentParam'))}
      </Grid>
      <Grid item xs={6} md={3}>
        <TextField
          select
          fullWidth
          size="small"
          label={t('customChar.buff.boostC')}
          value={row.boostC}
          onChange={(e) => update({ boostC: e.target.value })}
        >
          <MenuItem value="">{t('customChar.buff.none')}</MenuItem>
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <MenuItem key={c} value={`${c}`}>
              C{c}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid item xs={6} md={3}>
        <TextField
          fullWidth
          size="small"
          disabled={!row.boostC}
          label={t('customChar.buff.boostFactor')}
          value={row.boostFactor}
          error={!!row.boostC && !Number.isFinite(num(row.boostFactor))}
          onChange={(e) => update({ boostFactor: e.target.value })}
          inputProps={{ inputMode: 'decimal' }}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          fullWidth
          size="small"
          label={t('customChar.buff.condition2')}
          value={row.condition2}
          onChange={(e) => update({ condition2: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          fullWidth
          size="small"
          disabled={!row.condition2.trim()}
          label={t('customChar.buff.conditionState2')}
          value={row.conditionState2}
          onChange={(e) => update({ conditionState2: e.target.value })}
        />
      </Grid>
    </Grid>
  )
}

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
  const valueLabel = (r: AmountRow) =>
    r.talentParam
      ? t('customChar.buff.valueTimes')
      : r.scalingStat
        ? t('customChar.buff.valuePer', {
            per: r.scalingPer,
            stat: KeyMap.get(r.scalingStat),
          })
        : t('customChar.buff.value')
  const targetLabel = {
    self: t('customChar.buff.targetSelf'),
    team: t('customChar.buff.targetTeam'),
    others: t('customChar.buff.targetOthers'),
    active: t('customChar.buff.targetActive'),
  }

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {rows.map((r, i) => {
        if (open !== i) {
          const unit = isPercentStat(r.stat) ? '%' : ''
          const scaling = r.scalingStat
            ? ` / ${r.scalingPer} ${KeyMap.get(r.scalingStat)}`
            : ''
          const max = r.maxTalentParam
            ? ` (max ${r.maxTalentParam})`
            : r.max.trim()
              ? ` (max ${r.max}${unit})`
              : ''
          const amount = r.talentParam
            ? `${r.value} × ${r.talentParam}`
            : `${r.value}${unit}`
          const boost = r.boostC ? ` · C${r.boostC} ×${r.boostFactor}` : ''
          const cond2 = r.condition2
            ? ` · ${r.condition2}${r.conditionState2 ? `: ${r.conditionState2}` : ''}`
            : ''
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
              text={`${sourceShort(r.source)} · ${KeyMap.get(r.stat)} ${amount}${scaling}${max} · ${targetLabel[r.target]}${eles}${cond}${cond2}${boost}`}
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
                    label={valueLabel(r)}
                    value={r.value}
                    error={!Number.isFinite(num(r.value))}
                    onChange={(e) => update(i, { value: e.target.value })}
                    InputProps={r.talentParam ? undefined : percentAdornment}
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
                    <MenuItem value="active">
                      {t('customChar.buff.targetActive')}
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
                    disabled={!!r.maxTalentParam}
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
                <Grid item xs={12}>
                  <AdvancedAmountFields
                    def={def}
                    row={r}
                    update={(p) => update(i, p)}
                  />
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
          setRows([...rows, newRow()])
          setOpen(rows.length)
        }}
      >
        {t('customChar.buff.add')}
      </Button>
    </Box>
  )
}

/**
 * A row effect as edited: numbers as typed. `value` is in % for multipliers
 * and extra hits; a stat bonus uses the amount fields like a buff.
 */
export type RowEffectRow = AmountRow & {
  source: CustomCharacterBuffSource
  kind: 'multiplier' | 'extraHit' | 'bonus'
  stat: CustomCharacterBuffStat
  talent: '' | CustomCharacterTalentKey
  match: string
  value: string
  name: string
  condition: string
  conditionState: string
  bonuses: { stat: CustomCharacterBuffStat; value: string }[]
}

export function rowEffectToRow(e: CustomCharacterRowEffect): RowEffectRow {
  const stat = e.stat ?? 'all_dmg_'
  return {
    ...(e.kind === 'bonus'
      ? amountToRow(e, stat)
      : { ...newAmountRow(), value: show(e.value * 100) }),
    source: e.source,
    kind: e.kind,
    stat,
    talent: e.talent ?? '',
    match: e.match,
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
  if (r.kind === 'bonus') {
    const amount = rowToAmount(r, r.stat)
    if (!amount) return undefined
    return validateCustomCharacterRowEffect({
      ...amount,
      source: r.source,
      kind: r.kind,
      stat: r.stat,
      talent: r.talent || undefined,
      match: r.match,
      name: r.name,
      condition: r.condition,
      conditionState: r.conditionState,
    })
  }
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
  ...newAmountRow(),
  source: 'constellation2',
  kind: 'multiplier',
  stat: 'all_dmg_',
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
          const what =
            r.kind === 'bonus'
              ? `${KeyMap.get(r.stat)} ${r.talentParam ? `${r.value} × ${r.talentParam}` : `${r.value}${isPercentStat(r.stat) ? '%' : ''}`}${r.boostC ? ` (C${r.boostC} ×${r.boostFactor})` : ''}`
              : `${r.kind === 'multiplier' ? t('customChar.effect.multiplier') : t('customChar.effect.extraHit')} ${r.value}%`
          return (
            <SummaryRow
              key={i}
              text={`${sourceShort(r.source)} · ${what} · ${r.name || r.match}${cond}`}
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
                    <MenuItem value="bonus">
                      {t('customChar.effect.bonus')}
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
                    label={
                      r.kind !== 'bonus'
                        ? t('customChar.effect.value')
                        : r.talentParam
                          ? t('customChar.buff.valueTimes')
                          : t('customChar.buff.value')
                    }
                    value={r.value}
                    error={
                      r.kind === 'bonus'
                        ? !Number.isFinite(num(r.value))
                        : !(num(r.value) >= 0)
                    }
                    onChange={(e) => update(i, { value: e.target.value })}
                    InputProps={
                      r.kind === 'bonus' &&
                      (r.talentParam || !isPercentStat(r.stat))
                        ? undefined
                        : {
                            endAdornment: (
                              <InputAdornment position="end">%</InputAdornment>
                            ),
                          }
                    }
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
                {r.kind === 'bonus' && (
                  <>
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
                        select
                        fullWidth
                        size="small"
                        label={t('customChar.buff.scaling')}
                        value={r.scalingStat}
                        onChange={(e) =>
                          update(i, {
                            scalingStat: e.target
                              .value as AmountRow['scalingStat'],
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
                        onChange={(e) =>
                          update(i, { scalingPer: e.target.value })
                        }
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <TextField
                        fullWidth
                        size="small"
                        disabled={!!r.maxTalentParam}
                        label={t('customChar.buff.max')}
                        value={r.max}
                        error={
                          r.max.trim() !== '' && !Number.isFinite(num(r.max))
                        }
                        onChange={(e) => update(i, { max: e.target.value })}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <AdvancedAmountFields
                        def={def}
                        row={r}
                        update={(p) => update(i, p)}
                      />
                    </Grid>
                  </>
                )}
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
