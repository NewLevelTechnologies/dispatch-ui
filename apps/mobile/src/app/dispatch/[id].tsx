import { ActivityIndicator, Linking, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader, Button, Card, StatusPill, Stepper } from '../../components';
import { useDispatchDetail } from '../../dispatches/useDispatchDetail';
import { useWorkOrderContact } from '../../dispatches/useWorkOrderContact';
import { useUpdateDispatchStatus } from '../../dispatches/useUpdateDispatchStatus';
import { dispatchLifecycleSteps } from '../../dispatches/dispatchLifecycleSteps';
import { formatAddress } from '../../dispatches/formatAddress';
import { canComplete, canMarkArrived, canMarkEnRoute } from '../../dispatches/dispatchActions';
import { statusTone } from '../../schedule/statusTone';
import { formatArrivalTime } from '../../schedule/formatArrivalTime';

/**
 * A single visit: lifecycle timeline, location/contact, and the tech's own
 * status actions (Mark en route / Mark arrived / Complete). Reached by
 * tapping a job on Today or Schedule — `id` and `workOrderId` come along as
 * route params rather than the whole row object, so this screen is
 * self-sufficient from just those two ids (see useDispatchDetail.ts and
 * useWorkOrderContact.ts for why it needs both: neither alone has every
 * field this screen shows).
 */
export default function DispatchDetailScreen() {
  const { id, workOrderId } = useLocalSearchParams<{ id: string; workOrderId: string }>();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const { dispatch, isLoading, error, refetch } = useDispatchDetail(id);
  const contact = useWorkOrderContact(workOrderId);
  const updateStatus = useUpdateDispatchStatus(id);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSunken }]}>
        <ActivityIndicator size="large" color={colors.accent500} />
      </View>
    );
  }

  if (error || !dispatch) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSunken, padding: spacing.xl, gap: spacing.md }]}>
        <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>
          {t('dispatchDetail.errorTitle')}
        </Text>
        <Text style={{ color: colors.fgMuted, fontSize: 13, textAlign: 'center' }}>
          {t('dispatchDetail.errorBody')}
        </Text>
        <Button label={t('common.actions.tryAgain')} variant="secondary" onPress={() => void refetch()} />
      </View>
    );
  }

  const address = formatAddress(contact.address);
  const statusLabel =
    dispatch.status === 'IN_PROGRESS' ? t('workOrders.dispatches.onSite') : t(`workOrders.dispatches.status.${dispatch.status}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader
        title={contact.summary || contact.workOrderNumber || t('entities.workOrder')}
        eyebrow={contact.workOrderNumber ?? undefined}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <StatusPill label={statusLabel} tone={statusTone(dispatch.status)} />
          <Text style={{ color: colors.fgMuted, fontSize: 12 }}>
            {formatArrivalTime(dispatch.arrivalWindowStart)} – {formatArrivalTime(dispatch.arrivalWindowEnd)}
          </Text>
        </View>

        <Button
          label={t('workOrders.detail.overview.view', { entity: t('entities.workOrder') })}
          variant="secondary"
          onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: workOrderId } })}
        />

        <Card title={t('workOrders.dispatches.drawer.timeline', { entity: 'Dispatch' })}>
          <Stepper steps={dispatchLifecycleSteps(dispatch.lifecycle, dispatch.status, t)} />
        </Card>

        <Card title={t('workOrders.detail.siteContact')}>
          {address && (
            <Text style={{ color: colors.fgStrong, fontWeight: '600', fontSize: 14 }}>{address}</Text>
          )}
          {contact.contactName && (
            <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>{contact.contactName}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {contact.contactPhone && (
              <Button
                label={t('workOrders.detail.overview.call')}
                variant="secondary"
                onPress={() => void Linking.openURL(`tel:${contact.contactPhone}`)}
              />
            )}
            {address && (
              <Button
                label={t('workOrders.detail.directions')}
                variant="secondary"
                onPress={() =>
                  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
                }
              />
            )}
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          {canMarkEnRoute(dispatch.status) && (
            <Button
              label={t('workOrders.dispatches.drawer.markEnRoute')}
              variant="primary"
              onPress={() => updateStatus.mutate('EN_ROUTE')}
              disabled={updateStatus.isPending}
            />
          )}
          {canMarkArrived(dispatch.status) && (
            <Button
              label={t('workOrders.dispatches.drawer.markArrived')}
              variant={dispatch.status === 'EN_ROUTE' ? 'primary' : 'secondary'}
              onPress={() => updateStatus.mutate('IN_PROGRESS')}
              disabled={updateStatus.isPending}
            />
          )}
          {canComplete(dispatch.status) && (
            <Button
              label={t('workOrders.dispatches.markCompleted')}
              variant="secondary"
              onPress={() => updateStatus.mutate('COMPLETED')}
              disabled={updateStatus.isPending}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
