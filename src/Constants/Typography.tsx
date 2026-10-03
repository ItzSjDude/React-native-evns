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
  numsOfLine,
  ellipsisMode = 'tail',
  lineHeight,
}) => (
  <Text
    numberOfLines={numsOfLine}
    ellipsizeMode={ellipsisMode}
    style={[
      {
        lineHeight,
        fontSize: Math.max(1, (size - 1) / PixelRatio.getFontScale()),
        color,
        fontFamily,
        fontWeight,
        textAlign,
      },
      style,
    ]}>
    {children}
  </Text>
);

export default Typography;
