import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { workspaceMark } from './workspaceMark';

/**
 * Shown while a switch settles. Not decorative: switching drops the whole
 * query cache and remounts, so without this the person watches every list
 * empty and every count fall to zero — indistinguishable from a broken app.
 *
 * Names the destination, which is the confirmation the tap did what they
 * meant. Held a minimum beat by the caller so it reads as a transition rather
 * than a flash — see TenantContext's SWITCH_HOLD_MS.
 */
export function SwitchingOverlay({ companyName }: { companyName: string }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.overlay, { backgroundColor: colors.bgSunken }]}
    >
      <View style={[styles.mark, { backgroundColor: colors.accentTint }]}>
        <Text style={{ color: colors.accent700, fontWeight: '700', fontSize: 18 }}>
          {workspaceMark(companyName)}
        </Text>
      </View>
      <Text style={{ color: colors.fgStrong, fontWeight: '600', marginTop: spacing.sm }}>
        {t('workspace.switching.title', { company: companyName })}
      </Text>
      <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>
        {t('workspace.switching.body')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
