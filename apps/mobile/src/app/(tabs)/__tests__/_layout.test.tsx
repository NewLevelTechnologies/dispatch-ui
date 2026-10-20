import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import TabsLayout from '../_layout';

// A stand-in for expo-router's real tab navigator, which needs a mounted
// navigation container this test has no reason to provide — this test is
// about which tabs are configured and what each renders, not navigation.
//
// jest.mock's factory is hoisted above imports, so it can't close over `View`
// from the top-level import above — hence requiring react-native again here.
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View, Text } = jest.requireActual('react-native');
  function Tabs({ children }: { children: React.ReactNode }) {
    return React.createElement(View, null, children);
  }
  Tabs.Screen = ({ options }: { options: { title: string; tabBarIcon: (p: { color: string }) => React.ReactNode } }) =>
    React.createElement(
      View,
      null,
      React.createElement(Text, null, options.title),
      options.tabBarIcon({ color: '#ee6d00' })
    );
  return { Tabs };
});

jest.mock('../../../tenant/TenantGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

describe('TabsLayout', () => {
  it('configures all four tabs with a title and an icon', async () => {
    await render(
      <ThemeProvider>
        <TabsLayout />
      </ThemeProvider>
    );

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('▣')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('▦')).toBeTruthy();
    expect(screen.getByText('Lookup')).toBeTruthy();
    expect(screen.getByText('⌕')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('◍')).toBeTruthy();
  });
});
