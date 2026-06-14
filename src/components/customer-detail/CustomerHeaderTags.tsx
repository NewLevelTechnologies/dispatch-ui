// Customer header tag cluster — the customer-level twin of ServiceLocationDetailPage's
// HeaderTags. Tags ride the header pill line (after the status / terms pills,
// divider between), each tinted by its palette color, capped at 4 with a "+N"
// overflow chip. There is no Tags card; add/remove lives here.
//
//   · "+" chip → combobox popover anchored to the cluster (typeahead over the
//     tenant library, inline "Create '{text}'"). Apply is immediate — no Save
//     step — so the popover stays open for multi-tagging.
//   · Remove: hover-revealed × on a pill, or uncheck the tag in the popover's
//     applied section. Both are instant; an undo toast is the safety valve.
//     Removing clears the assignment only — the tag stays in the tenant catalog.
//   · "+N" opens the same popover rather than expanding inline, so the header
//     stays tight.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tagApi, type Tag, type TagSummary } from '../../api';
import { showError, showUndo, extractApiError } from '../../lib/toast';
import { nextTagColor } from '../../utils/tagColor';
import TagPicker from '../TagPicker';
import { TagPill } from '../ui/TagPill';

const HEADER_TAG_CAP = 4;

export default function CustomerHeaderTags({
  customerId,
  tags,
  canEdit,
}: {
  customerId: string;
  tags: TagSummary[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);

  const tagIds = tags.map((tag) => tag.id);

  const invalidate = () => {
    // Tags ride along on both the detail payload and the list rows.
    queryClient.invalidateQueries({ queryKey: ['customers', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  // Apply is a full idempotent sync — send the complete desired id set.
  const applyMutation = useMutation({
    mutationFn: (nextIds: string[]) => tagApi.setForCustomer(customerId, nextIds),
    onSuccess: invalidate,
    onError: (err: unknown) => showError(t('tags.errorApply'), extractApiError(err) ?? undefined),
  });

  // Removal is instant (no confirm) — the undo toast restores the pre-remove
  // id set via the idempotent sync. `tagIds` is captured at mutate time, so it
  // still includes the tag being removed.
  const removeMutation = useMutation({
    mutationFn: (tag: { id: string; name: string }) => tagApi.removeFromCustomer(customerId, tag.id),
    onSuccess: (_data, tag) => {
      invalidate();
      const prevIds = tagIds;
      showUndo(t('tags.removedToast', { name: tag.name }), t('common.undo'), () =>
        applyMutation.mutate(prevIds),
      );
    },
    onError: (err: unknown) => showError(t('tags.errorRemove'), extractApiError(err) ?? undefined),
  });

  // Create-and-apply: POST the new tag, then sync it onto this customer and
  // refresh the tenant library so it shows in future pickers.
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const created = await tagApi.create({ name, color: nextTagColor(tags.length) });
      await tagApi.setForCustomer(customerId, [...tagIds, created.id]);
      return created;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err: unknown) => showError(t('tags.errorCreate'), extractApiError(err) ?? undefined),
  });

  const busy = applyMutation.isPending || createMutation.isPending || removeMutation.isPending;

  const visible = tags.slice(0, HEADER_TAG_CAP);
  const overflow = tags.length - visible.length;

  // Nothing to show and nothing addable — render nothing (no divider).
  if (tags.length === 0 && !canEdit) return null;

  return (
    <>
      <span aria-hidden className="h-3.5 w-px self-center bg-border" />
      {visible.map((tag) => (
        <TagPill
          key={tag.id}
          color={tag.color}
          name={tag.name}
          removeOnHover
          onRemove={canEdit ? () => removeMutation.mutate(tag) : undefined}
          removeLabel={t('tags.remove', { name: tag.name })}
        />
      ))}
      <span className="relative inline-flex items-center gap-1.5">
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t('tags.showAll', { count: tags.length })}
            className="cursor-pointer text-[11px] font-semibold text-fg-muted hover:text-fg"
          >
            +{overflow}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t('tags.addTag')}
            className="flex h-[19px] w-[19px] cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-[12px] leading-none text-fg-muted hover:border-border-strong hover:text-fg"
          >
            +
          </button>
        )}
        {picking && (
          <div className="absolute top-full left-0 z-50 mt-1.5 w-64">
            <TagPicker
              appliedTagIds={tagIds}
              onApply={(tag: Tag) => applyMutation.mutate([...tagIds, tag.id])}
              onCreate={(name) => createMutation.mutate(name)}
              onRemove={canEdit ? (tag) => removeMutation.mutate(tag) : undefined}
              onClose={() => setPicking(false)}
              canCreate={canEdit}
              busy={busy}
            />
          </div>
        )}
      </span>
    </>
  );
}
