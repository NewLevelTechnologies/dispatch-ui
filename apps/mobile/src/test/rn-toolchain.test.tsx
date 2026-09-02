import { render, screen, fireEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Guards the test toolchain itself, not product code.
 *
 * Rendering a React Native component under test needs several things to line up
 * — jest-expo transforming JSX, resolving `react-native` and its platform
 * extensions, and the RNTL/test-renderer pair agreeing. This is the whole reason
 * mobile uses Jest rather than vitest, so a plain assertion that it still works
 * is worth the six lines: an Expo or RNTL upgrade that breaks rendering fails
 * here with an obvious cause, instead of surfacing inside an unrelated screen
 * test later.
 *
 * It also records the API shape that is easy to get wrong: in RNTL 14
 * `render` is ASYNC and queries live on `screen`, not on its return value.
 * Forgetting the await yields "getByText is not a function" or a
 * "notImplemented" screen, neither of which points at the real mistake.
 */
describe('react native test toolchain', () => {
  function Counter() {
    const [count, setCount] = useState(0);
    return (
      <View>
        <Text>count {count}</Text>
        <Pressable onPress={() => setCount(count + 1)}>
          <Text>increment</Text>
        </Pressable>
      </View>
    );
  }

  it('renders a component and reflects state updates', async () => {
    await render(<Counter />);
    expect(screen.getByText('count 0')).toBeTruthy();

    await fireEvent.press(screen.getByText('increment'));
    expect(screen.getByText('count 1')).toBeTruthy();
  });
});
