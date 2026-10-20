import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Card } from './Card';

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderCard = (title?: string) =>
  render(
    <ThemeProvider>
      <Card title={title}>
        <Text>Body content</Text>
      </Card>
    </ThemeProvider>
  );

describe('Card', () => {
  it('renders children', async () => {
    await renderCard();
    expect(screen.getByText('Body content')).toBeTruthy();
  });

  it('renders a title header when given one', async () => {
    await renderCard('Location');
    expect(screen.getByText('Location')).toBeTruthy();
  });

  it('omits the header entirely when no title is given', async () => {
    await renderCard();
    expect(screen.queryByText('Location')).toBeNull();
  });
});
