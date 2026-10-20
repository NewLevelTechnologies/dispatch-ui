import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Avatar } from './Avatar';

// RNTL 14's render() is async and queries live on `screen`, not the render
// result — see src/test/rn-toolchain.test.tsx.
const renderAvatar = (name: string) =>
  render(
    <ThemeProvider>
      <Avatar name={name} />
    </ThemeProvider>
  );

describe('Avatar', () => {
  it('renders first + last initials for a full name', async () => {
    await renderAvatar('Mike Reynolds');
    expect(screen.getByText('MR')).toBeTruthy();
  });

  it('renders a single initial for a one-word name', async () => {
    await renderAvatar('Dana');
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('falls back to a placeholder for an empty name rather than rendering nothing', async () => {
    await renderAvatar('   ');
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('labels itself with the full name for assistive tech', async () => {
    await renderAvatar('Mike Reynolds');
    expect(screen.getByLabelText('Mike Reynolds')).toBeTruthy();
  });
});
