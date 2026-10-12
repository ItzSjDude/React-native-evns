import React from 'react';
import {Linking, Text} from 'react-native';
import {PRIVACY_POLICY_URL, TERMS_URL} from '../../core/config/env';

const open = (url: string) => Linking.openURL(url).catch(() => {});

/**
 * "By continuing you agree to our Terms and Privacy Policy". Renders only the links that are configured
 * (HIVA_TERMS_URL / HIVA_PRIVACY_URL), so a build without hosted pages shows nothing instead of dead links.
 */
export default function LegalLinks({className = ''}: {className?: string}) {
  if (!TERMS_URL && !PRIVACY_POLICY_URL) return null;
  return (
    <Text className={`text-center text-[12px] leading-[18px] text-muted ${className}`}>
      By continuing you agree to our{' '}
      {TERMS_URL ? <Text accessibilityRole="link" className="font-semibold text-purple-soft" onPress={() => open(TERMS_URL!)}>Terms</Text> : null}
      {TERMS_URL && PRIVACY_POLICY_URL ? ' and ' : null}
      {PRIVACY_POLICY_URL ? <Text accessibilityRole="link" className="font-semibold text-purple-soft" onPress={() => open(PRIVACY_POLICY_URL!)}>Privacy Policy</Text> : null}
      .
    </Text>
  );
}
