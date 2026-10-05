import React from 'react';
import {View} from 'react-native';
import IconBallFootball from '@tabler/icons-react-native/IconBallFootball';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconBellFilled from '@tabler/icons-react-native/IconBellFilled';
import IconCamera from '@tabler/icons-react-native/IconCamera';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconChevronRightFilled from '@tabler/icons-react-native/IconChevronRightFilled';
import IconCirclePlus from '@tabler/icons-react-native/IconCirclePlus';
import IconCirclePlusFilled from '@tabler/icons-react-native/IconCirclePlusFilled';
import IconCircleFilled from '@tabler/icons-react-native/IconCircleFilled';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconCheckFilled from '@tabler/icons-react-native/IconCheckFilled';
import IconConfetti from '@tabler/icons-react-native/IconConfetti';
import IconConfettiFilled from '@tabler/icons-react-native/IconConfettiFilled';
import IconDotsVertical from '@tabler/icons-react-native/IconDotsVertical';
import IconDotsVerticalFilled from '@tabler/icons-react-native/IconDotsVerticalFilled';
import IconEdit from '@tabler/icons-react-native/IconEdit';
import IconEditFilled from '@tabler/icons-react-native/IconEditFilled';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconHome from '@tabler/icons-react-native/IconHome';
import IconHomeFilled from '@tabler/icons-react-native/IconHomeFilled';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import IconHeartFilled from '@tabler/icons-react-native/IconHeartFilled';
import IconLogout from '@tabler/icons-react-native/IconLogout';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconMapPinFilled from '@tabler/icons-react-native/IconMapPinFilled';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconMessageCircleFilled from '@tabler/icons-react-native/IconMessageCircleFilled';
import IconMessages from '@tabler/icons-react-native/IconMessages';
import IconMessagesFilled from '@tabler/icons-react-native/IconMessagesFilled';
import IconMusic from '@tabler/icons-react-native/IconMusic';
import IconRadar from '@tabler/icons-react-native/IconRadar';
import IconRadarFilled from '@tabler/icons-react-native/IconRadarFilled';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconRocket from '@tabler/icons-react-native/IconRocket';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconShare3 from '@tabler/icons-react-native/IconShare3';
import IconShieldCheck from '@tabler/icons-react-native/IconShieldCheck';
import IconShieldCheckFilled from '@tabler/icons-react-native/IconShieldCheckFilled';
import IconUser from '@tabler/icons-react-native/IconUser';
import IconUserFilled from '@tabler/icons-react-native/IconUserFilled';
import IconUserCircle from '@tabler/icons-react-native/IconUserCircle';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import {Colors} from './Colors';

const icons = {
  bell: IconBell,
  camera: IconCamera,
  image: IconPhoto,
  plus: IconCirclePlus,
  check: IconCheck,
  comment: IconMessageCircle,
  share: IconShare3,
  user: IconUser,
  home: IconHome,
  heart: IconHeartFilled,
  nearby: IconRadar,
  refresh: IconRefresh,
  party: IconConfetti,
  messages: IconMessages,
  profile: IconUserCircle,
  location: IconMapPin,
  music: IconMusic,
  rocket: IconRocket,
  search: IconSearch,
  football: IconBallFootball,
  chevron: IconChevronRight,
  people: IconUsers,
  shield: IconShieldCheck,
  edit: IconEdit,
  flag: IconFlag,
  logout: IconLogout,
  menu: IconDotsVertical,
};

export type IconName = keyof typeof icons;

const filledIcons: Partial<Record<IconName, typeof IconHomeFilled>> = {
  bell: IconBellFilled,
  plus: IconCirclePlusFilled,
  check: IconCheckFilled,
  comment: IconMessageCircleFilled,
  user: IconUserFilled,
  home: IconHomeFilled,
  heart: IconHeartFilled,
  nearby: IconRadarFilled,
  party: IconConfettiFilled,
  messages: IconMessagesFilled,
  location: IconMapPinFilled,
  chevron: IconChevronRightFilled,
  shield: IconShieldCheckFilled,
  edit: IconEditFilled,
  menu: IconDotsVerticalFilled,
};

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
};

export const AppIcon = ({name, size = 24, color = Colors.text, filled = true}: IconProps) => {
  if (name === 'profile' && filled) {
    return (
      <View className="items-center justify-center" style={{width: size, height: size}}>
        <IconCircleFilled size={size} color={color} />
        <View className="absolute">
          <IconUserFilled size={size * 0.72} color="#13111F" />
        </View>
      </View>
    );
  }

  const Icon = (filled ? filledIcons[name] : undefined) ?? icons[name];
  return <Icon size={size} color={color} strokeWidth={2} />;
};

export default AppIcon;
