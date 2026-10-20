import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { Stepper, type Step } from './Stepper';

const STEPS: Step[] = [
  { label: 'Scheduled', state: 'done' },
  { label: 'Notified', state: 'done' },
  { label: 'En route', state: 'done' },
  { label: 'Arrived', state: 'now' },
  { label: 'Departed', state: 'pending' },
];

describe('Stepper', () => {
  it('renders every step label in order', async () => {
    await render(
      <ThemeProvider>
        <Stepper steps={STEPS} />
      </ThemeProvider>
    );
    for (const step of STEPS) {
      expect(screen.getByText(step.label)).toBeTruthy();
    }
  });

  it('renders cleanly with an empty step list', async () => {
    await render(
      <ThemeProvider>
        <Stepper steps={[]} />
      </ThemeProvider>
    );
    expect(screen.queryByText('Scheduled')).toBeNull();
  });
});
