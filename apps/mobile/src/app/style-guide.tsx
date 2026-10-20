import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppHeader, Avatar, Button, Card, DispatchRow, Stepper, StatusPill } from '../components';

/**
 * Assembles every Phase 0 primitive on one screen so the "Dashboard Continuity"
 * direction (see apps/mobile/PLAN.md) can be reviewed live on-device — a Claude
 * Design mockup proves the idea, this proves the real fonts, touch targets and
 * RN rendering. Not part of the tab shell yet; reached via the link on the home
 * screen until Phase 1 gives it a permanent place.
 *
 * All example content below is fixture data for visual review, not product
 * copy — it is not meant to go through translation.
 */
const SAMPLE_JOBS = [
  { time: '8:00a', title: 'Johnson Residence', subtitle: 'No cool · HVAC · 2.1 mi' },
  { time: '10:30a', title: 'Riverside Diner', subtitle: 'Walk-in alarm · Refrigeration' },
] as const;

const SAMPLE_NAMES = ['Mike Reynolds', 'Dana Oyelaran', 'J. Kim'] as const;

const SAMPLE_ADDRESS = '4410 Industrial Pkwy, Bay 3';
const SAMPLE_GATE_NOTE = 'Gate code 4471 · unit around back';

export default function StyleGuide() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const lifecycleSteps = [
    { label: t('workOrders.dispatches.drawer.timelineScheduled'), state: 'done' as const },
    { label: t('workOrders.dispatches.drawer.timelineEnRoute'), state: 'done' as const },
    { label: t('workOrders.dispatches.drawer.timelineArrived'), state: 'now' as const },
    { label: t('workOrders.dispatches.drawer.timelineDeparted'), state: 'pending' as const },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader title={t('styleGuide.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}>
        <Section label={t('styleGuide.sections.buttons')}>
          <View style={{ gap: spacing.sm }}>
            <Button label={t('workOrders.detail.overview.call')} onPress={() => {}} variant="primary" />
            <Button label={t('workOrders.detail.directions')} onPress={() => {}} variant="secondary" />
            <Button label={t('workOrders.dispatches.markArrived')} onPress={() => {}} variant="ghost" />
          </View>
        </Section>

        <Section label={t('styleGuide.sections.status')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <StatusPill label={t('workOrders.dispatches.status.SCHEDULED')} tone="info" />
            <StatusPill label={t('workOrders.dispatches.status.EN_ROUTE')} tone="accent" />
            <StatusPill label={t('workOrders.dispatches.status.COMPLETED')} tone="success" />
            <StatusPill label={t('workOrders.dispatches.status.NO_SHOW')} tone="danger" />
          </View>
        </Section>

        <Section label={t('styleGuide.sections.cards')}>
          <Card title={t('workOrders.detail.siteContact')}>
            <Text style={{ color: colors.fgStrong, fontWeight: '600' }}>{SAMPLE_ADDRESS}</Text>
            <Text style={{ color: colors.fgMuted, marginTop: 2 }}>{SAMPLE_GATE_NOTE}</Text>
          </Card>
        </Section>

        <Section label={t('styleGuide.sections.avatars')}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {SAMPLE_NAMES.map((name) => (
              <Avatar key={name} name={name} />
            ))}
          </View>
        </Section>

        <Section label={t('styleGuide.sections.lifecycle')}>
          <Stepper steps={lifecycleSteps} />
        </Section>

        <Section label={t('styleGuide.sections.today')}>
          <View style={{ gap: spacing.sm }}>
            {SAMPLE_JOBS.map((job) => (
              <DispatchRow
                key={job.title}
                time={job.time}
                title={job.title}
                subtitle={job.subtitle}
                statusLabel={t('workOrders.dispatches.status.SCHEDULED')}
                statusTone="info"
                onPressCall={() => {}}
                onPressDirections={() => {}}
              />
            ))}
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={{ color: colors.fgMuted, fontSize: typography.label.fontSize, fontWeight: '700', marginBottom: 8 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 4,
  },
});
