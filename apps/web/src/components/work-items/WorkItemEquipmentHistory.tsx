import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  equipmentFilesApi,
  equipmentNotesApi,
  workOrderApi,
  type WorkOrderFile,
} from '../../api/setup';
import { FileLightbox } from '../WorkOrderFilesTab';
import { shortDate } from './format';

interface Props {
  workOrderId: string;
  equipment: { id: string; name: string };
}

const PHOTO_TILES = 5;
const NOTES_SHOWN = 2;
const PAST_JOBS = 3;

/**
 * What's known about the attached unit from OTHER jobs: earlier photos, the
 * equipment's notes, and its last few work orders. Hidden entirely when there
 * is nothing on file. Notes are read-only here — they're edited on the
 * equipment record.
 */
export default function WorkItemEquipmentHistory({ workOrderId, equipment }: Props) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<number | null>(null);
  const [allNotes, setAllNotes] = useState(false);
  const recordHref = `/equipment/${equipment.id}`;

  // Earlier photos = the equipment's photos from any other job (or the record
  // itself) — the server leaves this work order's out. Nameplate leads.
  const { data: photosPage, isSuccess: photosLoaded } = useQuery({
    queryKey: ['equipment-files', equipment.id, 'PHOTO', { excludeWorkOrderId: workOrderId }],
    queryFn: () =>
      equipmentFilesApi.list(equipment.id, { kind: 'PHOTO', limit: 50, excludeWorkOrderId: workOrderId }),
  });
  const photos = useMemo<WorkOrderFile[]>(
    () =>
      (photosPage?.content ?? [])
        .filter((f) => f.status !== 'FAILED')
        .sort((a, b) => Number(!!b.isNameplate) - Number(!!a.isNameplate)),
    [photosPage],
  );
  const photoTotal = Math.max(photosPage?.counts?.photos ?? 0, photos.length);

  const { data: allEquipmentNotes = [], isSuccess: notesLoaded } = useQuery({
    queryKey: ['equipment-notes', equipment.id],
    queryFn: () => equipmentNotesApi.list(equipment.id),
  });
  // Earlier notes: the ones not written on this job.
  const notes = allEquipmentNotes.filter((n) => n.workOrderId !== workOrderId);

  const { data: jobsPage, isSuccess: jobsLoaded } = useQuery({
    queryKey: ['work-orders-list', { equipmentId: equipment.id, recent: true }],
    queryFn: () => workOrderApi.getAll({ equipmentId: equipment.id, size: PAST_JOBS + 1, sort: 'createdAt,desc' }),
  });
  const pastJobs = (jobsPage?.content ?? []).filter((w) => w.id !== workOrderId).slice(0, PAST_JOBS);

  if (!photosLoaded || !notesLoaded || !jobsLoaded) return null;
  if (photos.length === 0 && notes.length === 0 && pastJobs.length === 0) return null;

  const shownNotes = allNotes ? notes : notes.slice(0, NOTES_SHOWN);
  const morePhotos = photoTotal - PHOTO_TILES;

  return (
    <section className="card" aria-label={t('workOrders.workItems.equipmentHistory')}>
      <div className="card-head">
        <div className="card-title">{t('workOrders.workItems.equipmentHistory')}</div>
        <span className="card-sub min-w-0 truncate">{equipment.name}</span>
        <span className="flex-1" />
        <Link to={`${recordHref}?tab=service-history`} className="card-action shrink-0">
          {t('workOrders.workItems.fullHistory')}
        </Link>
      </div>
      <div className="card-body flush">
        <div className="wit-eqsec">
          <div className="wit-eqh">
            <span>{t('workOrders.workItems.photos')}</span>
            <span className="flex-1" />
            {photos.length > 0 && <span className="tabular-nums">{photoTotal}</span>}
          </div>
          {photos.length === 0 ? (
            <div className="text-[11.5px] text-fg-muted">{t('workOrders.workItems.noneOnFile')}</div>
          ) : (
            <div className="wit-phgrid">
              {photos.slice(0, PHOTO_TILES).map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="wit-ph"
                  title={[p.caption, shortDate(p.createdAt), p.workOrderNumber].filter(Boolean).join(' · ')}
                  aria-label={p.caption || p.fileName}
                  onClick={() => setViewing(i)}
                >
                  <img src={p.thumbnailUrl ?? p.url} alt="" loading="lazy" />
                  {p.isNameplate && <span className="wit-phtag">{t('workOrders.workItems.nameplate')}</span>}
                </button>
              ))}
              {morePhotos > 0 && (
                <Link to={`${recordHref}?tab=media`} className="wit-ph more">
                  {`+${morePhotos}`}
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="wit-eqcols">
          <div className="wit-eqsec">
            <div className="wit-eqh">
              <span>{t('workOrders.workItems.notes')}</span>
              <span className="flex-1" />
              {notes.length > 0 && <span className="tabular-nums">{notes.length}</span>}
            </div>
            {notes.length === 0 && <div className="text-[11.5px] text-fg-muted">{t('workOrders.workItems.noneYet')}</div>}
            {shownNotes.map((n) => (
              <div key={n.id} className="wit-li">
                <div className="whitespace-pre-wrap text-[12px]/[1.5] text-fg">{n.body}</div>
                <div className="mt-0.5 text-[10.5px] text-fg-muted">
                  {[n.authorName, shortDate(n.createdAt)].filter(Boolean).join(' · ')}
                  {n.workOrderNumber && (
                    <>
                      {' · '}
                      <Link to={`/work-orders/${n.workOrderId}`} className="font-mono hover:text-fg-accent">
                        {n.workOrderNumber}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ))}
            {notes.length > NOTES_SHOWN && (
              <button type="button" className="card-action mt-1" onClick={() => setAllNotes((v) => !v)}>
                {allNotes ? t('workOrders.workItems.showLess') : t('workOrders.workItems.showAll', { count: notes.length })}
              </button>
            )}
          </div>
          <div className="wit-eqsec">
            <div className="wit-eqh">
              <span>{t('workOrders.workItems.pastJobs')}</span>
              <span className="flex-1" />
              <span className="tabular-nums">{pastJobs.length}</span>
            </div>
            {pastJobs.length === 0 && (
              <div className="text-[11.5px] text-fg-muted">{t('workOrders.workItems.firstVisit')}</div>
            )}
            {pastJobs.map((w) => {
              const summary = w.summary || w.workItems?.[0]?.description || '';
              const when = w.completedDate ?? w.scheduledDate ?? w.createdAt;
              const tech = w.assignedUsers?.[0]?.name;
              return (
                <Link key={w.id} to={`/work-orders/${w.id}`} className="wit-li group flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-fg-strong group-hover:text-fg-accent">
                      {summary}
                    </span>
                    <span className="block text-[10.5px] text-fg-muted">
                      {[shortDate(when), tech].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{w.workOrderNumber}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <FileLightbox
        media={photos}
        startIndex={viewing}
        onClose={() => setViewing(null)}
        readOnly
        onRequestDelete={() => undefined}
        showWorkOrder
      />
    </section>
  );
}
