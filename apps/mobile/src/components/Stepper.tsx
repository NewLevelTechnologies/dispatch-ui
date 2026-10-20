import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type StepState = 'done' | 'now' | 'pending';

export type Step = {
  /** Already-translated short label, e.g. "Arrived". */
  label: string;
  state: StepState;
};

type StepperProps = {
  steps: Step[];
};

/** Horizontal lifecycle dots — a Dispatch's scheduled→notified→en route→arrived→departed progress. */
export function Stepper({ steps }: StepperProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <View style={[styles.rail, { backgroundColor: colors.border }]} />
      {steps.map((step) => {
        const dotColor =
          step.state === 'done' ? colors.accent500 : step.state === 'now' ? colors.bgElev : colors.bgElev;
        const borderColor = step.state === 'pending' ? colors.border : colors.accent500;

        return (
          <View key={step.label} style={styles.step}>
            <View
              style={[
                styles.dot,
                { backgroundColor: dotColor, borderColor, borderWidth: step.state === 'done' ? 0 : 2 },
              ]}
            />
            <Text style={[styles.label, { color: colors.fgMuted }]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    paddingHorizontal: 4,
  },
  rail: {
    position: 'absolute',
    top: 7,
    left: 12,
    right: 12,
    height: 2,
  },
  step: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  label: {
    fontSize: 9,
  },
});
