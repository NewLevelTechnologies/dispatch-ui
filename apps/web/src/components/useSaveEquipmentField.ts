import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { equipmentApi, type UpdateEquipmentRequest } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';

// Single-field equipment PATCH shared by the work-item detail surfaces (the
// table expansion and the card tab). Throws on failure so the calling
// EditableField stays in edit mode for retry/cancel. Embedded equipment
// summaries live on workItems[].equipment in WO responses, so a write has to
// refresh both work-order query prefixes plus the equipment caches — same
// contract as EquipmentDetailPage so cross-surface edits stay coherent.
export function useSaveEquipmentField() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ equipmentId, data }: { equipmentId: string; data: UpdateEquipmentRequest }) =>
      equipmentApi.update(equipmentId, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', vars.equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
    },
  });

  return async <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => {
    try {
      await updateEquipmentMutation.mutateAsync({
        equipmentId,
        data: { [field]: next } as UpdateEquipmentRequest,
      });
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
      throw err;
    }
  };
}
