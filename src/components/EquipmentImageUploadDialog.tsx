import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentImagesApi,
  EQUIPMENT_IMAGE_CAPTION_MAX_CHARS,
  EQUIPMENT_IMAGE_CONTENT_TYPES,
  EQUIPMENT_IMAGE_MAX_BYTES,
  type EquipmentImage,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface EquipmentImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentId: string;
}

type Stage = 'requesting' | 'uploading' | 'confirming';

const ACCEPT = EQUIPMENT_IMAGE_CONTENT_TYPES.join(',');
const MAX_BYTES = EQUIPMENT_IMAGE_MAX_BYTES;

export default function EquipmentImageUploadDialog({
  isOpen,
  onClose,
  equipmentId,
}: EquipmentImageUploadDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setCaption('');
    setErrorMessage(null);
    setStage(null);
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const uploadMutation = useMutation({
    mutationFn: ({ file, caption }: { file: File; caption: string }) =>
      equipmentImagesApi.upload(equipmentId, file, {
        caption: caption.trim() || null,
        onProgress: (s) => setStage(s),
      }),
    onSuccess: (image: EquipmentImage) => {
      void image;
      queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
      setStage(null);
      onClose();
    },
    onError: (err: unknown) => {
      setStage(null);
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : undefined;
      setErrorMessage(msg || t('equipment.images.errorCreate'));
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    // Belt-and-suspenders type check. The accept attribute already filters in
    // the OS picker, but a user can still drag in a HEIC or other unsupported
    // type from the file system.
    if (!(EQUIPMENT_IMAGE_CONTENT_TYPES as readonly string[]).includes(f.type)) {
      setErrorMessage(t('equipment.images.unsupportedType'));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrorMessage(
        t('equipment.images.tooLarge', {
          size: (f.size / 1024 / 1024).toFixed(1),
          max: Math.round(MAX_BYTES / 1024 / 1024),
        })
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!file) {
      setErrorMessage(t('equipment.images.fileRequired'));
      return;
    }
    uploadMutation.mutate({ file, caption });
  };

  const isUploading = uploadMutation.isPending;
  const stageLabel =
    stage === 'requesting'
      ? t('equipment.images.stageRequesting')
      : stage === 'uploading'
        ? t('equipment.images.stageUploading')
        : stage === 'confirming'
          ? t('equipment.images.stageConfirming')
          : null;

  return (
    <Dialog open={isOpen} onClose={isUploading ? () => undefined : onClose} size="lg">
      <DialogTitle>{t('equipment.images.titleAdd')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <Fieldset>
            <FieldGroup className="!space-y-4">
              <Field>
                <Label>{t('equipment.images.chooseFile')} *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={handleFileChange}
                  disabled={isUploading}
                  aria-label={t('equipment.images.chooseFile')}
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
              </Field>

              <Field>
                <Label>{t('equipment.filters.label')}</Label>
                <Input
                  name="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, EQUIPMENT_IMAGE_CAPTION_MAX_CHARS))}
                  placeholder={t('equipment.images.captionPlaceholder')}
                  disabled={isUploading}
                  maxLength={EQUIPMENT_IMAGE_CAPTION_MAX_CHARS}
                />
              </Field>

              {stageLabel && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{stageLabel}</p>
              )}
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isUploading || !file}>
            {isUploading ? t('common.saving') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
