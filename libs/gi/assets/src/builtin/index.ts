// Images of the custom characters and weapons that ship with GO (see
// `gi/consts` builtinCustom), by their source id, so a copy imported
// from a pack before gets them too.
import Anastasya_icon from './Anastasya/icon.webp'
import Anastasya_iconSide from './Anastasya/iconSide.webp'
import Anastasya_banner from './Anastasya/banner.webp'
import Anastasya_skill from './Anastasya/skill.webp'
import Anastasya_burst from './Anastasya/burst.webp'
import Anastasya_passive1 from './Anastasya/passive1.webp'
import Anastasya_passive2 from './Anastasya/passive2.webp'
import Anastasya_passive3 from './Anastasya/passive3.webp'
import Anastasya_passive from './Anastasya/passive.webp'
import Anastasya_constellation1 from './Anastasya/constellation1.webp'
import Anastasya_constellation2 from './Anastasya/constellation2.webp'
import Anastasya_constellation3 from './Anastasya/constellation3.webp'
import Anastasya_constellation4 from './Anastasya/constellation4.webp'
import Anastasya_constellation5 from './Anastasya/constellation5.webp'
import Anastasya_constellation6 from './Anastasya/constellation6.webp'
import Danica_icon from './Danica/icon.webp'
import Danica_iconSide from './Danica/iconSide.webp'
import Danica_banner from './Danica/banner.webp'
import Danica_skill from './Danica/skill.webp'
import Danica_burst from './Danica/burst.webp'
import Danica_passive1 from './Danica/passive1.webp'
import Danica_passive2 from './Danica/passive2.webp'
import Danica_passive3 from './Danica/passive3.webp'
import Danica_passive from './Danica/passive.webp'
import Danica_constellation1 from './Danica/constellation1.webp'
import Danica_constellation2 from './Danica/constellation2.webp'
import Danica_constellation3 from './Danica/constellation3.webp'
import Danica_constellation4 from './Danica/constellation4.webp'
import Danica_constellation5 from './Danica/constellation5.webp'
import Danica_constellation6 from './Danica/constellation6.webp'
import Silverdawn_icon from './Silverdawn/icon.webp'
import Silverdawn_awakenIcon from './Silverdawn/awakenIcon.webp'
import TorrentsOfSpring_icon from './TorrentsOfSpring/icon.webp'
import TorrentsOfSpring_awakenIcon from './TorrentsOfSpring/awakenIcon.webp'

export const builtinCharacterImages: Record<number, Record<string, string>> = {
  10000149: {
    icon: Anastasya_icon,
    iconSide: Anastasya_iconSide,
    banner: Anastasya_banner,
    skill: Anastasya_skill,
    burst: Anastasya_burst,
    passive1: Anastasya_passive1,
    passive2: Anastasya_passive2,
    passive3: Anastasya_passive3,
    passive: Anastasya_passive,
    constellation1: Anastasya_constellation1,
    constellation2: Anastasya_constellation2,
    constellation3: Anastasya_constellation3,
    constellation4: Anastasya_constellation4,
    constellation5: Anastasya_constellation5,
    constellation6: Anastasya_constellation6,
  },
  10000147: {
    icon: Danica_icon,
    iconSide: Danica_iconSide,
    banner: Danica_banner,
    skill: Danica_skill,
    burst: Danica_burst,
    passive1: Danica_passive1,
    passive2: Danica_passive2,
    passive3: Danica_passive3,
    passive: Danica_passive,
    constellation1: Danica_constellation1,
    constellation2: Danica_constellation2,
    constellation3: Danica_constellation3,
    constellation4: Danica_constellation4,
    constellation5: Danica_constellation5,
    constellation6: Danica_constellation6,
  },
}
export const builtinWeaponImages: Record<number, Record<string, string>> = {
  15517: { icon: Silverdawn_icon, awakenIcon: Silverdawn_awakenIcon },
  12517: {
    icon: TorrentsOfSpring_icon,
    awakenIcon: TorrentsOfSpring_awakenIcon,
  },
}
