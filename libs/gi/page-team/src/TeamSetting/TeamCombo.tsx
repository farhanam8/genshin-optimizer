import { CardThemed, ImgIcon, SqBadge } from '@genshin-optimizer/common/ui'
import { artifactDefIcon, weaponAsset } from '@genshin-optimizer/gi/assets'
import type { ArtifactSetKey, CharacterKey } from '@genshin-optimizer/gi/consts'
import { allArtifactSetKeys } from '@genshin-optimizer/gi/consts'
import type { ICachedWeapon, TeamComboPick } from '@genshin-optimizer/gi/db'
import { useDatabase, useDBMeta, useTeam } from '@genshin-optimizer/gi/db-ui'
import { getCharEle } from '@genshin-optimizer/gi/stats'
import {
  ArtifactSetName,
  ArtifactSetTooltip,
  CharacterName,
  CharIconSide,
  useTeamDataNoContext,
  WeaponName,
} from '@genshin-optimizer/gi/ui'
import { input } from '@genshin-optimizer/gi/wr'
import TimerIcon from '@mui/icons-material/Timer'
import {
  Box,
  CardContent,
  CardHeader,
  Checkbox,
  Divider,
  Grid,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 1 : 0 })

/** The value of each custom multi-target of a team member, as on its own page */
function useMemberTargets(teamId: string, teamCharId: string | undefined) {
  const database = useDatabase()
  // Custom multi-targets are only computed for the character the data is
  // made for, so each member needs its own team data.
  const teamData = useTeamDataNoContext(
    teamCharId ? teamId : '',
    teamCharId ?? ''
  )
  const teamChar = teamCharId ? database.teamChars.get(teamCharId) : undefined
  if (!teamChar) return undefined
  const memberData = teamData?.[teamChar.key]
  const display = memberData?.target.getDisplay()['custom']
  // Pieces per set, as the build (equipped, saved or TC) is computed
  const sets = memberData
    ? allArtifactSetKeys
        .map((setKey) => ({
          setKey,
          count: memberData.target.get(input.artSet[setKey]).value ?? 0,
        }))
        .filter(({ count }) => count >= 2)
        .sort((a, b) => b.count - a.count)
    : []
  return {
    characterKey: teamChar.key as CharacterKey,
    weapon: memberData?.weapon,
    sets,
    targets: teamChar.customMultiTargets.map(({ name }, i) => ({
      name,
      value: display?.[i]?.value as number | undefined,
    })),
  }
}

/** The weapon and artifact set bonuses of a team member's build */
function MemberBuild({
  weapon,
  sets,
}: {
  weapon?: ICachedWeapon
  sets: { setKey: ArtifactSetKey; count: number }[]
}) {
  const { t } = useTranslation('page_team')
  return (
    <Box display="flex" flexDirection="column" gap={0.5} px={2} pb={1}>
      {weapon && (
        <Box display="flex" alignItems="center" gap={1}>
          <ImgIcon
            src={weaponAsset(weapon.key, weapon.ascension >= 2)}
            size={2}
          />
          <Typography variant="body2" noWrap flexGrow={1} minWidth={0}>
            <WeaponName weaponKey={weapon.key} />
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            Lv. {weapon.level} · R{weapon.refinement}
          </Typography>
        </Box>
      )}
      {sets.length ? (
        sets.map(({ setKey, count }) => (
          <ArtifactSetTooltip key={setKey} setKey={setKey} numInSet={count}>
            <Box display="flex" alignItems="center" gap={1}>
              <ImgIcon src={artifactDefIcon(setKey)} size={2} />
              <SqBadge color={count >= 4 ? 'success' : 'primary'}>
                {count >= 4 ? 4 : 2}
              </SqBadge>
              <Typography variant="body2" noWrap minWidth={0}>
                <ArtifactSetName setKey={setKey} />
              </Typography>
            </Box>
          </ArtifactSetTooltip>
        ))
      ) : (
        <Typography variant="caption" color="text.secondary">
          {t('teamSettings.combo.noSet')}
        </Typography>
      )}
    </Box>
  )
}

/** A number field that keeps what is typed and reports valid positive values */
function NumberField({
  value,
  onChange,
  label,
  unit,
  width,
}: {
  value: number
  onChange: (v: number) => void
  label?: string
  unit?: string
  width: number
}) {
  const [text, setText] = useState(`${value}`)
  useEffect(() => {
    setText((t) => (Number(t) === value ? t : `${value}`))
  }, [value])
  const n = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(n) && n > 0
  return (
    <TextField
      size="small"
      label={label}
      value={text}
      error={!valid}
      sx={{ width }}
      onChange={(e) => {
        setText(e.target.value)
        const v = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(v) && v > 0)
          onChange(v)
      }}
      inputProps={{ inputMode: 'decimal' }}
      InputProps={
        unit
          ? {
              endAdornment: (
                <InputAdornment position="end">{unit}</InputAdornment>
              ),
            }
          : undefined
      }
    />
  )
}

/**
 * Team damage over a rotation: picked custom multi-targets of the members,
 * each done a number of times, summed, and divided by the rotation length.
 */
export function TeamCombo({ teamId }: { teamId: string }) {
  const { t } = useTranslation('page_team')
  const database = useDatabase()
  const { gender } = useDBMeta()
  const team = useTeam(teamId)!
  const { loadoutData, combo } = team
  const members = [
    useMemberTargets(teamId, loadoutData[0]?.teamCharId),
    useMemberTargets(teamId, loadoutData[1]?.teamCharId),
    useMemberTargets(teamId, loadoutData[2]?.teamCharId),
    useMemberTargets(teamId, loadoutData[3]?.teamCharId),
  ]

  const pickOf = (teamCharId: string, target: number) =>
    combo.picks.find((p) => p.teamCharId === teamCharId && p.target === target)
  const setPicks = (f: (picks: TeamComboPick[]) => TeamComboPick[]) =>
    database.teams.set(teamId, (team) => {
      team.combo = { ...team.combo, picks: f(team.combo.picks) }
    })
  const toggle = (teamCharId: string, target: number, on: boolean) =>
    setPicks((picks) =>
      on
        ? [...picks, { teamCharId, target, count: 1 }]
        : picks.filter(
            (p) => !(p.teamCharId === teamCharId && p.target === target)
          )
    )
  const setCount = (teamCharId: string, target: number, count: number) =>
    setPicks((picks) =>
      picks.map((p) =>
        p.teamCharId === teamCharId && p.target === target ? { ...p, count } : p
      )
    )
  const setRotationTime = (rotationTime: number) =>
    database.teams.set(teamId, (team) => {
      team.combo = { ...team.combo, rotationTime }
    })

  const rows = loadoutData.map((loadoutDatum, slot) => {
    const member = members[slot]
    if (!loadoutDatum || !member) return undefined
    const { teamCharId } = loadoutDatum
    const targets = member.targets.map((target, i) => {
      const pick = pickOf(teamCharId, i)
      return {
        ...target,
        index: i,
        pick,
        total: pick ? (target.value ?? 0) * pick.count : 0,
      }
    })
    return {
      teamCharId,
      characterKey: member.characterKey,
      weapon: member.weapon,
      sets: member.sets,
      targets,
      total: targets.reduce((a, x) => a + x.total, 0),
    }
  })
  const total = rows.reduce((a, r) => a + (r?.total ?? 0), 0)
  const dps = total / combo.rotationTime

  return (
    <CardThemed bgt="light">
      <CardHeader
        avatar={<TimerIcon />}
        title={t('teamSettings.combo.title')}
        subheader={t('teamSettings.combo.desc')}
        titleTypographyProps={{ variant: 'h6' }}
      />
      <Divider />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Grid container columns={{ xs: 1, md: 2, lg: 4 }} spacing={2}>
          {rows.map((row, slot) => (
            <Grid item xs={1} key={row?.teamCharId ?? slot}>
              {row && (
                <CardThemed sx={{ height: '100%' }}>
                  <Box display="flex" alignItems="center" gap={1} px={2} py={1}>
                    <CharIconSide characterKey={row.characterKey} />
                    <Typography variant="subtitle1" flexGrow={1}>
                      <CharacterName
                        characterKey={row.characterKey}
                        gender={gender}
                      />
                    </Typography>
                  </Box>
                  <MemberBuild weapon={row.weapon} sets={row.sets} />
                  <Divider />
                  <Box display="flex" flexDirection="column" gap={0.5} p={1}>
                    {!row.targets.length && (
                      <Typography variant="body2" color="text.secondary" px={1}>
                        {t('teamSettings.combo.noTargets')}
                      </Typography>
                    )}
                    {row.targets.map((x) => (
                      <Box
                        key={x.index}
                        display="flex"
                        alignItems="center"
                        gap={1}
                      >
                        <Checkbox
                          size="small"
                          sx={{ p: 0.5 }}
                          checked={!!x.pick}
                          inputProps={{ 'aria-label': x.name }}
                          onChange={(_, on) =>
                            toggle(row.teamCharId, x.index, on)
                          }
                        />
                        <Box flexGrow={1} minWidth={0}>
                          <Typography variant="body2" noWrap title={x.name}>
                            {x.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {x.value === undefined ? '…' : fmt(x.value)}
                            {x.pick &&
                              x.pick.count !== 1 &&
                              ` × ${x.pick.count} = ${fmt(x.total)}`}
                          </Typography>
                        </Box>
                        {x.pick && (
                          <NumberField
                            label={t('teamSettings.combo.count')}
                            value={x.pick.count}
                            unit="×"
                            width={84}
                            onChange={(v) =>
                              setCount(row.teamCharId, x.index, v)
                            }
                          />
                        )}
                      </Box>
                    ))}
                  </Box>
                  <Divider />
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    px={2}
                    py={1}
                  >
                    <Typography variant="body2">
                      {t('teamSettings.combo.subtotal')}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{fmt(row.total)}</strong>
                      {total > 0 &&
                        ` (${((row.total / total) * 100).toFixed(1)}%)`}
                    </Typography>
                  </Box>
                </CardThemed>
              )}
            </Grid>
          ))}
        </Grid>
        <CardThemed>
          <CardContent
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <Box display="flex" flexWrap="wrap" alignItems="center" gap={3}>
              <NumberField
                label={t('teamSettings.combo.rotationTime')}
                value={combo.rotationTime}
                unit="s"
                width={140}
                onChange={setRotationTime}
              />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('teamSettings.combo.totalDmg')}
                </Typography>
                <Typography variant="h6" data-testid="team-combo-total">
                  {fmt(total)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('teamSettings.combo.dps', { time: combo.rotationTime })}
                </Typography>
                <Typography
                  variant="h6"
                  color="success.main"
                  data-testid="team-combo-dps"
                >
                  {fmt(dps)}
                </Typography>
              </Box>
            </Box>
            {total > 0 && (
              <Box
                display="flex"
                height={12}
                borderRadius={1}
                overflow="hidden"
              >
                {rows.map(
                  (row) =>
                    row &&
                    row.total > 0 && (
                      <Tooltip
                        key={row.teamCharId}
                        title={
                          <span>
                            <CharacterName
                              characterKey={row.characterKey}
                              gender={gender}
                            />
                            {`: ${fmt(row.total)} (${((row.total / total) * 100).toFixed(1)}%), ${fmt(row.total / combo.rotationTime)} DPS`}
                          </span>
                        }
                      >
                        <Box
                          sx={{
                            width: `${(row.total / total) * 100}%`,
                            bgcolor: `${getCharEle(row.characterKey)}.main`,
                          }}
                        />
                      </Tooltip>
                    )
                )}
              </Box>
            )}
          </CardContent>
        </CardThemed>
      </CardContent>
    </CardThemed>
  )
}
