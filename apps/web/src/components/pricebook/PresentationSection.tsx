import { useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@dispatch/i18n';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { MEDIA_MAX_BYTES, MEDIA_TYPES, mediaApi, type PresentationPhoto } from '../../api/setup';
import { Button } from '../catalyst/button';
import { Description, Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Textarea } from '../catalyst/textarea';
import { FormSection } from '../settings/PricingPageParts';
import { errorCode, showError } from '../../lib/toast';
import { isFilled, type PresentationDraft } from './pricebookModel';
import { useEntityNames } from '../../hooks/useEntityNames';

const MAX_PHOTOS = 4;
const MAX_HIGHLIGHTS = 5;

const EMPTY: PresentationDraft = { customerName: '', description: '', highlights: [], photos: [] };

/**
 * How an item is shown to customers on public quotes: photos (the first is
 * the main one), a customer-facing name, a description and highlights.
 * Optional and collapsed until used, so tenants that send standard quotes
 * never see more than one line of it. Photos upload straight into the
 * tenant's media library; nothing is attached until the item is saved.
 */
export function PresentationSection({
  value,
  itemName,
  readOnly,
  onChange,
}: {
  value: PresentationDraft | null;
  itemName: string;
  readOnly: boolean;
  onChange: (next: PresentationDraft | null) => void;
}) {
  const names = useEntityNames();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const p = value ?? EMPTY;
  const filled = isFilled(value);
  const set = (patch: Partial<PresentationDraft>) => onChange({ ...p, ...patch });

  const summary = [
    p.photos.length ? t('settings.pricebook.presentation.photoCount', { count: p.photos.length }) : null,
    p.description.trim() ? t('settings.pricebook.presentation.hasDescription') : null,
    p.highlights.filter((h) => h.trim()).length
      ? t('settings.pricebook.presentation.highlightCount', { count: p.highlights.filter((h) => h.trim()).length })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const upload = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - p.photos.length;
    const picked = Array.from(files).slice(0, room);
    const added: PresentationPhoto[] = [];
    setUploading(picked.length);
    for (const file of picked) {
      if (!MEDIA_TYPES.includes(file.type)) {
        showError(t('settings.pricebook.presentation.uploadFailed', { name: file.name }), t('settings.pricebook.presentation.wrongType'));
      } else if (file.size > MEDIA_MAX_BYTES) {
        showError(t('settings.pricebook.presentation.uploadFailed', { name: file.name }), t('settings.pricebook.presentation.tooLarge'));
      } else {
        try {
          const media = await mediaApi.upload(file);
          if (media.url && media.thumbnailUrl) added.push({ id: media.id, url: media.url, thumbnailUrl: media.thumbnailUrl });
        } catch (err) {
          const code = errorCode(err);
          showError(
            t('settings.pricebook.presentation.uploadFailed', { name: file.name }),
            code === 'UNREADABLE_IMAGE' ? t('settings.pricebook.presentation.unreadable') : t('settings.pricebook.presentation.uploadRetry'),
          );
        }
      }
      setUploading((n) => n - 1);
    }
    if (added.length) set({ photos: [...p.photos, ...added] });
    if (fileInput.current) fileInput.current.value = '';
  };

  if (!open) {
    return (
      <FormSection title={t('settings.pricebook.presentation.title', names)} description={t('settings.pricebook.presentation.optional')}>
        <div className="flex flex-wrap items-center gap-3">
          {filled && p.photos[0] && (
            <img src={p.photos[0].thumbnailUrl} alt="" className="size-12 shrink-0 rounded-md border border-border object-cover" />
          )}
          <div className="min-w-[220px] flex-1">
            {filled ? (
              <div className="text-[12.5px] text-fg">
                <span className="font-semibold text-fg-strong">{p.customerName.trim() || itemName}</span>
                {summary && <span className="text-fg-muted"> · {summary}</span>}
              </div>
            ) : (
              <>
                <div className="text-[12.5px] text-fg">{t('settings.pricebook.presentation.pitch', names)}</div>
                <div className="mt-0.5 text-[11.5px] text-fg-muted">{t('settings.pricebook.presentation.skip', names)}</div>
              </>
            )}
          </div>
          {!readOnly ? (
            <Button outline size="xs" onClick={() => setOpen(true)}>
              {filled ? t('common.edit') : t('settings.pricebook.presentation.add')}
            </Button>
          ) : (
            filled && (
              <Button plain size="xs" onClick={() => setOpen(true)}>
                {t('settings.pricebook.presentation.view')}
              </Button>
            )
          )}
        </div>
      </FormSection>
    );
  }

  return (
    <FormSection title={t('settings.pricebook.presentation.title', names)} description={t('settings.pricebook.presentation.where', names)}>
      <Field>
        <Label>{t('settings.pricebook.presentation.photos')}</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {p.photos.map((photo, i) => (
            <div key={photo.id} className="group relative">
              <img
                src={photo.thumbnailUrl}
                alt={i === 0 ? t('settings.pricebook.presentation.mainPhoto') : t('settings.pricebook.presentation.photoN', { n: i + 1 })}
                className={clsx('size-24 rounded-lg border object-cover', i === 0 ? 'border-accent-500' : 'border-border')}
              />
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-bg-elev px-1 text-[10px] font-semibold text-fg-strong">
                  {t('settings.pricebook.presentation.main')}
                </span>
              )}
              {!readOnly && (
                <div className="absolute right-1 top-1 flex gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => set({ photos: [photo, ...p.photos.filter((x) => x.id !== photo.id)] })}
                      className="rounded bg-bg-elev px-1 !text-[10px] !font-semibold text-fg-strong shadow-sm"
                    >
                      {t('settings.pricebook.presentation.makeMain')}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t('settings.pricebook.presentation.removePhoto', { n: i + 1 })}
                    onClick={() => set({ photos: p.photos.filter((x) => x.id !== photo.id) })}
                    className="rounded bg-bg-elev p-0.5 text-fg-muted shadow-sm hover:text-fg-strong"
                  >
                    <XMarkIcon className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="flex size-24 items-center justify-center rounded-lg border border-dashed border-border text-[11px] text-fg-muted">
              {t('settings.pricebook.presentation.uploading')}
            </div>
          ))}
          {!readOnly && p.photos.length + uploading < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex size-24 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border-strong !text-[11.5px] text-fg-muted hover:text-fg-strong"
            >
              <span className="text-[18px] leading-none">+</span>
              {t('settings.pricebook.presentation.addPhoto')}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_TYPES.join(',')}
            multiple
            hidden
            aria-label={t('settings.pricebook.presentation.addPhoto')}
            onChange={(e) => void upload(e.target.files)}
          />
        </div>
        <Description>{t('settings.pricebook.presentation.photosHint')}</Description>
      </Field>
      <Field>
        <Label>{t('settings.pricebook.presentation.customerName', names)}</Label>
        <Input value={p.customerName} maxLength={120} disabled={readOnly} placeholder={itemName} onChange={(e) => set({ customerName: e.target.value })} />
        <Description>{t('settings.pricebook.presentation.customerNameHint')}</Description>
      </Field>
      <Field>
        <Label>{t('settings.pricebook.presentation.description')}</Label>
        <Textarea
          rows={3}
          maxLength={2000}
          disabled={readOnly}
          value={p.description}
          placeholder={t('settings.pricebook.presentation.descriptionPlaceholder')}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <Field>
        <Label>{t('settings.pricebook.presentation.highlights')}</Label>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {p.highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                aria-label={t('settings.pricebook.presentation.highlightN', { n: i + 1 })}
                value={h}
                maxLength={120}
                disabled={readOnly}
                onChange={(e) => set({ highlights: p.highlights.map((x, k) => (k === i ? e.target.value : x)) })}
              />
              {!readOnly && (
                <Button
                  plain
                  size="xs"
                  aria-label={t('settings.pricebook.presentation.removeHighlight', { n: i + 1 })}
                  onClick={() => set({ highlights: p.highlights.filter((_, k) => k !== i) })}
                >
                  <XMarkIcon />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && p.highlights.length < MAX_HIGHLIGHTS && (
            <div>
              <Button plain size="xs" onClick={() => set({ highlights: [...p.highlights, ''] })}>
                {t('settings.pricebook.presentation.addHighlight')}
              </Button>
            </div>
          )}
        </div>
        <Description>{t('settings.pricebook.presentation.highlightsHint')}</Description>
      </Field>
      <div className="flex gap-2">
        <Button plain size="xs" onClick={() => setOpen(false)}>
          {t('settings.pricebook.presentation.collapse')}
        </Button>
        {!readOnly && filled && (
          <Button
            plain
            size="xs"
            className="text-danger-500"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {t('settings.pricebook.presentation.remove')}
          </Button>
        )}
      </div>
    </FormSection>
  );
}
