import { Linking, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop, WorkOrder } from '@dispatch/api';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, StatusPill } from '../components';
import { statusTone } from '../schedule/statusTone';
import { openDirections } from '../maps/openDirections';
import { clock } from './clock';
import { focusAction, formatEstimate } from './myDayModel';

/** "1192 Spalding Dr, Sandy Springs" — street and city are all a tech needs to recognise the place. */
function siteLine(stop: MyDayStop): string | null {
  return [stop.serviceLocationStreet, stop.serviceLocationCity].filter(Boolean).join(', ') || null;
}

/** The full address for a maps handoff — the city alone won't route anyone. */
function fullAddress(stop: MyDayStop): string | null {
  const parts = [stop.serviceLocationStreet, stop.serviceLocationCity, stop.serviceLocationState, stop.serviceLocationZip];
  return parts.filter(Boolean).join(', ') || null;
}

/**
 * What to do right now: the one stop that's live, or the next one up.
 *
 * The primary action walks the visit forward — Start driving → Arrived —
 * except on the last step, where completing hands off to the work order
 * rather than flipping the status blindly from here.
 *
 * `canEdit` is Phase 5's capability gate: a tech whose role can't move jobs
 * along still gets the card, the address and the call button, just not the
 * actions the server would refuse.
 */
export function FocusCard({
  stop,
  workOrder,
  timeZone,
  canEdit,
  pending,
  onAdvance,
  onComplete,
  onOpenWorkOrder,
}: {
  stop: MyDayStop;
  /** Only for who to call — never for the schedule, which is the stop's released window. */
  workOrder: WorkOrder | undefined;
  timeZone: string;
  canEdit: boolean;
  pending: boolean;
  onAdvance: (to: 'EN_ROUTE' | 'IN_PROGRESS') => void;
  onComplete: () => void;
  onOpenWorkOrder: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const action = focusAction(stop.status);
  const window = [clock(stop.arrivalWindowStart, timeZone), clock(stop.arrivalWindowEnd, timeZone)]
    .filter(Boolean)
    .join(' – ');
  const estimate = formatEstimate(stop.estimatedDuration);
  const address = fullAddress(stop);
  const site = siteLine(stop);

  const contactPhone = workOrder?.serviceLocation?.siteContactPhone ?? workOrder?.customer?.phone ?? null;
  const contactName = workOrder?.serviceLocation?.siteContactName ?? workOrder?.customer?.name ?? null;

  const eyebrow =
    stop.status === 'IN_PROGRESS'
      ? t('myDay.focus.onSiteSince', { time: clock(stop.arrivedAt, timeZone) ?? '' })
      : stop.status === 'EN_ROUTE'
        ? t('myDay.focus.enRoute')
        : t('myDay.focus.upNext');

  return (
    <Card>
      <View style={styles.topRow}>
        <StatusPill label={eyebrow} tone={statusTone(stop.status)} />
        <View style={{ flex: 1 }} />
        {stop.workOrderNumber && (
          <Text style={{ color: colors.fgMuted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
            {stop.workOrderNumber}
          </Text>
        )}
      </View>

      <View style={[styles.windowRow, { marginTop: spacing.sm }]}>
        <Text style={{ color: colors.fgStrong, fontSize: 26, fontWeight: '700' }}>{window}</Text>
        {estimate && (
          <Text style={{ color: colors.fgMuted, fontSize: 12 }}>{t('myDay.focus.estimate', { estimate })}</Text>
        )}
      </View>

      {stop.workOrderSummary && (
        <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '600', marginTop: spacing.xs }}>
          {stop.workOrderSummary}
        </Text>
      )}
      {stop.customerName && (
        <Text style={{ color: colors.fg, fontSize: 13, marginTop: 2 }}>{stop.customerName}</Text>
      )}
      {site && <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>{site}</Text>}

      {canEdit && action && (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label={t(`myDay.actions.${action.labelKey}`)}
            variant="primary"
            disabled={pending}
            onPress={() => (action.kind === 'complete' ? onComplete() : onAdvance(action.to))}
          />
        </View>
      )}

      <View style={[styles.actions, { marginTop: spacing.sm, gap: spacing.sm }]}>
        {address && (
          <Button
            label={t('myDay.actions.navigate')}
            variant="secondary"
            onPress={() => void openDirections(address, t)}
          />
        )}
        {contactPhone && (
          <Button
            label={t('myDay.actions.call', { name: contactName ?? '' })}
            variant="secondary"
            onPress={() => void Linking.openURL(`tel:${contactPhone}`)}
          />
        )}
        {stop.workOrderNumber && (
          <Button
            label={t('myDay.actions.open', { id: stop.workOrderNumber })}
            variant="secondary"
            onPress={onOpenWorkOrder}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
