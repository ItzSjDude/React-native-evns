import React, {ReactNode} from 'react';
import {
  PixelRatio,
  StyleProp,
  Text,
  TextProps,
  TextStyle,
} from 'react-native';
import {Colors} from './Colors';
import {Fonts} from './Fonts';

export type TypographyProps = {
  children: ReactNode;
  size?: number;
  color?: string;
  fontFamily?: TextStyle['fontFamily'];
  fontWeight?: TextStyle['fontWeight'];
  textAlign?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  className?: string;
  numsOfLine?: number;
  ellipsisMode?: TextProps['ellipsizeMode'];
  lineHeight?: number;
};

export const Typography: React.FC<TypographyProps> = ({
  children,
  size = 14,
  color = Colors.textDark,
  fontFamily = Fonts.Inter_Regular,
  fontWeight,
  textAlign,
  style,
  className,
  numsOfLine,
  ellipsisMode = 'tail',
  lineHeight,
}) => (
  <Text
    className={className}
    numberOfLines={numsOfLine}
    ellipsizeMode={ellipsisMode}
    style={[
      {
        ...(lineHeight !== undefined ? {lineHeight} : {}),
        fontSize: Math.max(1, (size - 1) / PixelRatio.getFontScale()),
        color,
        fontFamily,
        ...(fontWeight !== undefined ? {fontWeight} : {}),
        ...(textAlign !== undefined ? {textAlign} : {}),
      },
      style,
    ]}>
    {children}
  </Text>
);

export default Typography;
