import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  TaxonomyItem,
  CreateTaxonomyItemRequest,
  UpdateTaxonomyItemRequest,
} from '../../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Field, FieldGroup, Label, Description } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Button } from '../catalyst/button';

interface TaxonomyApi {
  create: (req: CreateTaxonomyItemRequest) => Promise<TaxonomyItem>;
  update: (id: string, req: UpdateTaxonomyItemRequest) => Promise<TaxonomyItem>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entityLabel: string;
  api: TaxonomyApi;
  queryKey: string[];
  item?: TaxonomyItem;
  nextSortOrder: number;
}

const codeFromName = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export default function TaxonomyFormDialog({
  isOpen,
  onClose,
  entityLabel,
  api,
  queryKey,
  item,
  nextSortOrder,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!item;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366F1');

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(item?.name ?? '');
      setCode(item?.code ?? '');
      setCodeManuallyEdited(false);
      setDescription(item?.description ?? '');
      setColor(item?.color ?? '#6366F1');
    }
  }, [isOpen, item]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEdit && !codeManuallyEdited) {
      setCode(codeFromName(value));
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    setCodeManuallyEdited(true);
  };

  const createMutation = useMutation({
    mutationFn: (req: CreateTaxonomyItemRequest) => api.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || `Failed to create ${entityLabel.toLowerCase()}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateTaxonomyItemRequest) => api.update(item!.id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || `Failed to update ${entityLabel.toLowerCase()}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const trimmedDescription = description.trim();

    if (isEdit) {
      updateMutation.mutate({
        name: trimmedName,
        description: trimmedDescription || null,
        color,
      });
    } else {
      createMutation.mutate({
        name: trimmedName,
        code: trimmedCode,
        description: trimmedDescription || null,
        color,
        sortOrder: nextSortOrder,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEdit ? t('common.edit') : t('common.create')} {entityLabel}
        </DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('common.form.name')} *</Label>
              <Input
                name="name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <Label>{t('common.form.code')} *</Label>
              <Input
                name="code"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCodeChange(e.target.value)}
                pattern="[A-Z][A-Z0-9_]*"
                required
                disabled={isEdit}
              />
              <Description>
                {isEdit
                  ? t('settings.taxonomy.codeImmutable')
                  : t('settings.taxonomy.codeHelper')}
              </Description>
            </Field>
            <Field>
              <Label>{t('common.form.description')}</Label>
              <Input
                name="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{t('common.form.color')}</Label>
              <div className="flex gap-2 items-center">
                <Input
                  name="color"
                  type="color"
                  value={color}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
                  className="w-20"
                />
                <Input
                  type="text"
                  value={color}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
