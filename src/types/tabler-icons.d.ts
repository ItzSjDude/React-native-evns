// The package's subpath exports omit their TypeScript declaration files in v3.48.0.
// The root package provides the shared icon component type.
declare module '@tabler/icons-react-native/*' {
  import type {Icon} from '@tabler/icons-react-native';

  const TablerIcon: Icon;
  export default TablerIcon;
}
