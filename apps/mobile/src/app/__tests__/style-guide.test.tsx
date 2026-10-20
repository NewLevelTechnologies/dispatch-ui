import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../theme/ThemeProvider';
import StyleGuide from '../style-guide';

const METRICS = { insets: { top: 44, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } };

// RNTL 14's render() is async — see src/test/rn-toolchain.test.tsx.
const renderStyleGuide = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <StyleGuide />
      </ThemeProvider>
    </SafeAreaProvider>
  );

/**
 * This screen has no behavior of its own — it is a visual assembly of every
 * Phase 0 primitive. The test only confirms each section actually renders
 * (nothing crashes composing them together, every section header and a piece
 * of its content shows up) — not what it looks like, which is what the
 * on-device review is for.
 */
describe('StyleGuide', () => {
  it('renders the header', async () => {
    await renderStyleGuide();
    expect(screen.getByText('Style guide')).toBeTruthy();
  });

  it.each([
    ['Buttons', 'Mark arrived'],
    ['Status', 'En route'],
    ['Cards', 'Site Contact'],
    ['Lifecycle', 'Scheduled'],
    ['Today row', 'Johnson Residence'],
  ])('renders the %s section', async (sectionLabel, sampleContent) => {
    await renderStyleGuide();
    expect(screen.getByText(sectionLabel)).toBeTruthy();
    expect(screen.getAllByText(sampleContent).length).toBeGreaterThan(0);
  });

  it('renders one avatar per sample name', async () => {
    await renderStyleGuide();
    expect(screen.getByText('MR')).toBeTruthy();
    expect(screen.getByText('DO')).toBeTruthy();
    expect(screen.getByText('JK')).toBeTruthy();
  });
});
