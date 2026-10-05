import {createNavigationContainerRef} from '@react-navigation/native';

export type RootNavigationParamList = {
  Login: undefined;
  Onboarding: undefined;
  Home: undefined;
  Nearby: undefined;
  Messages: undefined;
  Profile: undefined;
  Notifications: undefined;
};

export const navigationRef =
  createNavigationContainerRef<RootNavigationParamList>();

const READY_POLL_MS = 100;
const READY_MAX_ATTEMPTS = 80;

export function navigateWhenReady<RouteName extends keyof RootNavigationParamList>(
  name: RouteName,
  ...args: RootNavigationParamList[RouteName] extends undefined
    ? []
    : [params: RootNavigationParamList[RouteName]]
): void {
  let attempts = 0;

  const tryNavigate = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate(name, ...(args as never));
      return;
    }

    attempts += 1;
    if (attempts < READY_MAX_ATTEMPTS) {
      setTimeout(tryNavigate, READY_POLL_MS);
    }
  };

  tryNavigate();
}
