/**
 * Bundled fonts (assets/fonts, linked by `npx react-native-asset`). On Android the file name is the family, and
 * a custom family has no weight axis, so each weight is its own family; `bodyFamily` picks the right one.
 * Manrope is the body face and Bricolage Grotesque the display face (headings and numbers).
 */
export const Fonts = {
  Manrope_Regular: 'Manrope-Regular',
  Manrope_Medium: 'Manrope-Medium',
  Manrope_SemiBold: 'Manrope-SemiBold',
  Manrope_Bold: 'Manrope-Bold',
  Manrope_ExtraBold: 'Manrope-ExtraBold',
  Display_SemiBold: 'BricolageGrotesque-SemiBold',
  Display_Bold: 'BricolageGrotesque-Bold',
  Display_ExtraBold: 'BricolageGrotesque-ExtraBold',
} as const;

type Weight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'normal' | 'bold' | undefined;

/** Maps a CSS-style fontWeight to the matching Manrope file (Manrope ships 400-800). */
export const bodyFamily = (weight?: Weight): string => {
  switch (weight) {
    case '500': return Fonts.Manrope_Medium;
    case '600': return Fonts.Manrope_SemiBold;
    case '700':
    case 'bold': return Fonts.Manrope_Bold;
    case '800':
    case '900': return Fonts.Manrope_ExtraBold;
    default: return Fonts.Manrope_Regular;
  }
};
