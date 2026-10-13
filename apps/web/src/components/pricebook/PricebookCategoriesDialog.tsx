import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { pricebookApi, type PricebookCategory, type PricebookCategoryRequest } from '../../api/setup';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { showError, showSuccess } from '../../lib/toast';
import { categoryTree, descendantIds } from './pricebookModel';
import { CATEGORIES_KEY, toCategoryRequest, usePricebookError } from './pricebookRequests';

/**
 * Add, rename, move and deactivate pricebook categories. Kept to one dialog:
 * categories change rarely, and a category can't be deactivated while it
 * still holds active items or subcategories (409 CATEGORY_IN_USE).
 */
export function PricebookCategoriesDialog({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: PricebookCategory[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pricebookError = usePricebookError();
  const [editingId, setEditingId] = useState<string | null>(null);
  const tree = categoryTree(categories);

  const save = useMutation({
    mutationFn: ({ id, request }: { id: string | null; request: PricebookCategoryRequest }) =>
      id ? pricebookApi.updateCategory(id, request) : pricebookApi.createCategory(request),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      showSuccess(t('settings.pricebook.categories.saved', { name: saved.name }));
      setEditingId(null);
    },
    onError: (err) => showError(t('settings.pricebook.categories.saveFailed'), pricebookError(err)),
  });

  const nextSortOrder = (parentId: string | null) => {
    const siblings = categories.filter((c) => c.parentId === parentId);
    return siblings.length ? Math.max(...siblings.map((c) => c.sortOrder)) + 1 : 0;
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t('settings.pricebook.categories.manageTitle')}</DialogTitle>
      <DialogDescription>{t('settings.pricebook.categories.manageDescription')}</DialogDescription>
      <DialogBody className="!mt-3">
        <ul className="divide-y divide-border-soft rounded-md border border-border">
          {tree.map(({ category, level }) => (
            <li key={category.id} className={clsx('px-2.5 py-1.5', !category.active && 'opacity-55')}>
              {editingId === category.id ? (
                <CategoryForm
                  categories={categories}
                  initial={category}
                  busy={save.isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(name, parentId) =>
                    save.mutate({
                      id: category.id,
                      request: toCategoryRequest(category, {
                        name,
                        parentId,
                        sortOrder: parentId === category.parentId ? category.sortOrder : nextSortOrder(parentId),
                      }),
                    })
                  }
                />
              ) : (
                <div className="flex items-center gap-2" style={{ paddingLeft: level * 14 }}>
                  <span className="flex-1 text-[12.5px] text-fg-strong">
                    {category.name}
                    {!category.active && <span className="ml-1.5 text-[11px] text-fg-muted">{t('common.inactive')}</span>}
                  </span>
                  <Button plain size="xs" onClick={() => setEditingId(category.id)}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    plain
                    size="xs"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ id: category.id, request: toCategoryRequest(category, { active: !category.active }) })}
                  >
                    {category.active ? t('settings.pricebook.deactivate') : t('settings.pricebook.activate')}
                  </Button>
                </div>
              )}
            </li>
          ))}
          {!tree.length && <li className="px-2.5 py-3 text-[12px] text-fg-muted">{t('settings.pricebook.categories.none')}</li>}
        </ul>
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-fg-strong">{t('settings.pricebook.categories.add')}</div>
          <CategoryForm
            key={categories.length}
            categories={categories}
            busy={save.isPending}
            onSubmit={(name, parentId) =>
              save.mutate({ id: null, request: { name, parentId, sortOrder: nextSortOrder(parentId), active: true } })
            }
          />
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CategoryForm({
  categories,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  categories: PricebookCategory[];
  initial?: PricebookCategory;
  busy: boolean;
  onSubmit: (name: string, parentId: string | null) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [parentId, setParentId] = useState(initial?.parentId ?? '');
  // A category can't sit under itself or anything below it.
  const blocked = initial ? descendantIds(categories, initial.id) : new Set<string>();
  const parents = categoryTree(categories.filter((c) => c.active && !blocked.has(c.id)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && !busy) onSubmit(name.trim(), parentId || null);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
      <Field>
        <Label className="!text-[11px]">{t('settings.pricebook.categories.name')}</Label>
        <Input size="xs" autoFocus={!!initial} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <Label className="!text-[11px]">{t('settings.pricebook.categories.parent')}</Label>
        <Select size="xs" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('settings.pricebook.categories.topLevel')}</option>
          {parents.map(({ category, level }) => (
            <option key={category.id} value={category.id}>
              {'  '.repeat(level)}
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-1.5">
        <Button type="submit" color="dark/zinc" size="xs" disabled={!name.trim() || busy}>
          {initial ? t('common.save') : t('settings.pricebook.categories.addButton')}
        </Button>
        {onCancel && (
          <Button plain size="xs" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
