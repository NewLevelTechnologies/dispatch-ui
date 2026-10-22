import { useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import type { WorkItemResponse, WorkOrderFile } from '@dispatch/api';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader, Button, Card, StatusPill } from '../../components';
import { useWorkOrderDetail } from '../../work-orders/useWorkOrderDetail';
import { useServiceLocationDetail } from '../../work-orders/useServiceLocationDetail';
import { useWorkItemStatuses } from '../../work-orders/useWorkItemStatuses';
import { useWorkOrderPhotos } from '../../work-orders/useWorkOrderFiles';
import { useWorkOrderNotes } from '../../work-orders/useWorkOrderNotes';
import { groupFilesByWorkItem } from '../../work-orders/groupFilesByWorkItem';
import { workItemStatusTone } from '../../work-orders/workItemStatusTone';
import { formatAddress } from '../../dispatches/formatAddress';
import { openDirections } from '../../maps/openDirections';

const NOTE_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/**
 * The work order behind a visit: location/access, every work item (with its
 * photos, if any), and notes. Reached from Dispatch detail. View-only for
 * work items (no editing diagnosis, no photo capture — see
 * useWorkOrderFiles.ts for why) and for the activity feed, which isn't built
 * yet — only notes are, per apps/mobile/PLAN.md's Phase 4 split.
 */
export default function WorkOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const { workOrder, isLoading, error, refetch } = useWorkOrderDetail(id);
  const { serviceLocation } = useServiceLocationDetail(workOrder?.serviceLocation?.id);
  const { labelFor } = useWorkItemStatuses();
  const { photos } = useWorkOrderPhotos(id);
  const { notes, addNote, isAdding } = useWorkOrderNotes(id);
  const [draftNote, setDraftNote] = useState('');

  const photosByItem = groupFilesByWorkItem(photos);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
        <AppHeader title={t('entities.workOrder')} onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent500} />
        </View>
      </View>
    );
  }

  if (error || !workOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
        <AppHeader title={t('entities.workOrder')} onBack={() => router.back()} />
        <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
          <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>
            {t('workOrderDetail.errorTitle')}
          </Text>
          <Text style={{ color: colors.fgMuted, fontSize: 13, textAlign: 'center' }}>
            {t('workOrderDetail.errorBody')}
          </Text>
          <Button label={t('common.actions.tryAgain')} variant="secondary" onPress={() => void refetch()} />
        </View>
      </View>
    );
  }

  const address = formatAddress(serviceLocation?.address ?? workOrder.serviceLocation?.address ?? null);
  const contactName = serviceLocation?.siteContactName ?? workOrder.serviceLocation?.siteContactName ?? null;
  const contactPhone = serviceLocation?.siteContactPhone ?? workOrder.serviceLocation?.siteContactPhone ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader
        title={workOrder.summary || workOrder.workOrderNumber || t('entities.workOrder')}
        subtitle={workOrder.workOrderNumber ?? undefined}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Card title={t('workOrders.detail.siteContact')}>
          {address && <Text style={{ color: colors.fgStrong, fontWeight: '600', fontSize: 14 }}>{address}</Text>}
          {contactName && (
            <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>{contactName}</Text>
          )}
          {serviceLocation?.accessInstructions && (
            <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: spacing.sm }}>
              {serviceLocation.accessInstructions}
            </Text>
          )}
          {(serviceLocation?.arrivalFacts ?? []).map((fact) => (
            <View key={fact.id} style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 4 }}>
              <Text style={{ color: colors.fgMuted, fontSize: 12, fontWeight: '600' }}>{fact.label}:</Text>
              <Text
                style={{
                  color: colors.fgStrong,
                  fontSize: 12,
                  fontFamily: fact.mono ? 'ui-monospace, Menlo, monospace' : undefined,
                }}
              >
                {fact.value}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {contactPhone && (
              <Button
                label={t('workOrders.detail.overview.call')}
                variant="secondary"
                onPress={() => void Linking.openURL(`tel:${contactPhone}`)}
              />
            )}
            {address && (
              <Button
                label={t('workOrders.detail.directions')}
                variant="secondary"
                onPress={() => void openDirections(address, t)}
              />
            )}
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          {workOrder.workItems.map((item) => (
            <WorkItemCard key={item.id} item={item} statusLabel={labelFor(item.statusId)} photos={photosByItem.get(item.id) ?? []} />
          ))}
        </View>

        <Card title={t('notes.title')}>
          <View style={{ gap: spacing.sm }}>
            {notes.length === 0 && (
              <Text style={{ color: colors.fgMuted, fontSize: 12 }}>{t('notes.empty')}</Text>
            )}
            {notes.map((note) => (
              <View key={note.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingBottom: spacing.sm }}>
                <Text style={{ color: colors.fgStrong, fontSize: 13 }}>{note.body}</Text>
                <Text style={{ color: colors.fgMuted, fontSize: 11, marginTop: 2 }}>
                  {note.createdByUserName && `${note.createdByUserName} · `}
                  {NOTE_DATE.format(new Date(note.createdAt))}
                </Text>
              </View>
            ))}
            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              placeholder={t('notes.addPlaceholder')}
              placeholderTextColor={colors.fgMuted}
              multiline
              style={[styles.noteInput, { borderColor: colors.border, color: colors.fgStrong }]}
            />
            <Button
              label={t('notes.add')}
              variant="secondary"
              disabled={!draftNote.trim() || isAdding}
              onPress={() => {
                addNote(draftNote.trim());
                setDraftNote('');
              }}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function WorkItemCard({
  item,
  statusLabel,
  photos,
}: {
  item: WorkItemResponse;
  statusLabel: string | null;
  photos: WorkOrderFile[];
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const equipmentLabel = item.equipment
    ? item.equipment.name
    : item.equipmentNeeded === false
      ? t('workOrders.detail.overview.noEquipment', { equipment: t('entities.equipment') })
      : t('workOrders.detail.overview.attachEquipment', { equipment: t('entities.equipment') });

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.fgStrong, fontWeight: '700', fontSize: 14, flex: 1 }}>{item.description}</Text>
        <StatusPill label={statusLabel ?? item.statusCategory} tone={workItemStatusTone(item.statusCategory)} />
      </View>
      <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>{equipmentLabel}</Text>
      <Text style={{ color: colors.fg, fontSize: 12, marginTop: spacing.xs }}>
        {item.diagnosis || t('workOrders.detail.overview.notYetDiagnosed')}
      </Text>
      {photos.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.sm }}>
          {photos.slice(0, 6).map((photo) => (
            <Image
              key={photo.id}
              testID={`photo-${photo.id}`}
              source={{ uri: photo.thumbnailUrl ?? photo.url }}
              style={styles.thumbnail}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
});
