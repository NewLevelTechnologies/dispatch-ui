import { useEffect, useMemo, useState, useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  BellAlertIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import {
  notificationTemplateApi,
  type NotificationTemplateListItem,
} from '../../api/setup';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Text } from '../../components/catalyst/text';
import { PageHead } from '../../components/ui/PageHead';
import { ListToolbar, ListSearch } from '../../components/ui/ListToolbar';
import {
  FilterChipListbox,
  ChipListboxOption,
} from '../../components/ui/FilterChipListbox';
import { FiltersSheet } from '../../components/ui/FiltersSheet';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { Card, CardBody } from '../../components/ui/Card';
import {
  DenseTable,
  DenseTHead,
  DenseRow,
  CellStack,
  CellTop,
  CellSub,
} from '../../components/ui/DenseTable';
import { extractApiError } from '../../lib/toast';

type ChannelValue = '' | 'EMAIL' | 'SMS';
type StatusValue = '' | 'system' | 'custom';
type AudienceValue = '' | 'CUSTOMER' | 'INTERNAL';

const CHANNEL_VALUES: ChannelValue[] = ['EMAIL', 'SMS'];
const STATUS_VALUES: StatusValue[] = ['system', 'custom'];
const AUDIENCE_VALUES: AudienceValue[] = ['CUSTOMER', 'INTERNAL'];

function readChannel(raw: string | null): ChannelValue {
  return CHANNEL_VALUES.includes(raw as ChannelValue)
    ? (raw as ChannelValue)
    : '';
}
function readStatus(raw: string | null): StatusValue {
  return STATUS_VALUES.includes(raw as StatusValue) ? (raw as StatusValue) : '';
}
function readAudience(raw: string | null): AudienceValue {
  return AUDIENCE_VALUES.includes(raw as AudienceValue)
    ? (raw as AudienceValue)
    : '';
}

export default function NotificationTemplatesPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canView = useHasCapability('VIEW_SETTINGS');
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const channelFilter = readChannel(searchParams.get('channel'));
  const statusFilter = readStatus(searchParams.get('status'));
  const audienceFilter = readAudience(searchParams.get('audience'));

  const [searchQuery, setSearchQuery] = useState(urlSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const activeFilterCount = [channelFilter, audienceFilter, statusFilter].filter(
    Boolean
  ).length;

  const updateFilters = (
    updates: {
      search?: string;
      channel?: ChannelValue;
      status?: StatusValue;
      audience?: AudienceValue;
    },
    options: { replace?: boolean } = {}
  ) => {
    const next = new URLSearchParams(searchParams);
    if (updates.search !== undefined) {
      if (updates.search) next.set('search', updates.search);
      else next.delete('search');
    }
    if (updates.channel !== undefined) {
      if (updates.channel) next.set('channel', updates.channel);
      else next.delete('channel');
    }
    if (updates.status !== undefined) {
      if (updates.status) next.set('status', updates.status);
      else next.delete('status');
    }
    if (updates.audience !== undefined) {
      if (updates.audience) next.set('audience', updates.audience);
      else next.delete('audience');
    }
    setSearchParams(next, { replace: options.replace ?? false });
  };

  const {
    data: rawTemplates,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => notificationTemplateApi.getAll(),
    enabled: canView,
  });

  // PUSH is stubbed FAILED in the BE; hide PUSH templates from the catalog
  // until the channel goes live. This filter comes off when PUSH ships.
  const templates = useMemo<NotificationTemplateListItem[] | undefined>(
    () => rawTemplates?.filter((tpl) => tpl.channel !== 'PUSH'),
    [rawTemplates]
  );

  // Client-side filter — catalog is ~15 items and there's no list-search endpoint.
  const filtered = useMemo<NotificationTemplateListItem[]>(() => {
    if (!templates) return [];
    const q = deferredSearch.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (channelFilter && tpl.channel !== channelFilter) return false;
      if (audienceFilter && tpl.audience !== audienceFilter) return false;
      if (statusFilter === 'system' && !tpl.isSystemTemplate) return false;
      if (statusFilter === 'custom' && tpl.isSystemTemplate) return false;
      if (q) {
        const hay =
          `${tpl.displayName} ${tpl.subject ?? ''} ${tpl.notificationTypeKey}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [templates, deferredSearch, channelFilter, audienceFilter, statusFilter]);

  const customizedCount = useMemo(
    () => templates?.filter((tpl) => !tpl.isSystemTemplate).length ?? 0,
    [templates]
  );
  const systemDefaultCount = (templates?.length ?? 0) - customizedCount;

  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const handleOpen = (tpl: NotificationTemplateListItem) => {
    navigate(`/settings/notifications/${tpl.id}`);
  };

  const fmtUpdated = (tpl: NotificationTemplateListItem): string | null => {
    if (!tpl.updatedAt) return null;
    const when = new Date(tpl.updatedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return tpl.updatedByName ? `Updated ${when} · ${tpl.updatedByName}` : `Updated ${when}`;
  };

  const channelLabel = (v: ChannelValue): string =>
    v === 'EMAIL'
      ? t('settings.notificationTemplates.channel.email')
      : v === 'SMS'
        ? t('settings.notificationTemplates.channel.sms')
        : '';

  const statusLabel = (v: StatusValue): string =>
    v === 'system'
      ? t('settings.notificationTemplates.status.systemDefault')
      : v === 'custom'
        ? t('settings.notificationTemplates.status.customized')
        : '';

  const audienceLabel = (v: AudienceValue): string =>
    v === 'CUSTOMER'
      ? t('settings.notificationTemplates.audience.customer')
      : v === 'INTERNAL'
        ? t('settings.notificationTemplates.audience.internal')
        : '';

  // Subtitle is explanatory copy + a Mustache chip example. The customized
  // count lives on the toolbar's right slot — keeping the head purely about
  // "what is this page" and the toolbar purely about "filter this set."
  const subtitle = (
    <>
      {t('settings.notificationTemplates.subtitle')}{' '}
      <code className="rounded-[3px] bg-bg-elev-2 px-1 py-px font-mono text-[11.5px] text-fg-strong">
        {'{{customer_name}}'}
      </code>
      .
    </>
  );

  const footerLeft = (() => {
    if (!templates || templates.length === 0) return null;
    return t('settings.notificationTemplates.footerCount', {
      count: filtered.length,
      total: templates.length,
    });
  })();

  // The filter chips render in two places: inline on the desktop toolbar, and
  // stacked inside the mobile FiltersSheet. Defined once so the two stay in sync.
  const filterControls = (
    <>
      <FilterChipListbox
        label={t('settings.notificationTemplates.filter.channel')}
        ariaLabel={t('settings.notificationTemplates.filter.channel')}
        value={channelFilter || null}
        displayValue={channelFilter ? channelLabel(channelFilter) : null}
        resetLabel={t('settings.notificationTemplates.filter.allChannels')}
        onChange={(v) => updateFilters({ channel: readChannel(v) })}
        onClear={() => updateFilters({ channel: '' })}
      >
        <ChipListboxOption value="EMAIL">{channelLabel('EMAIL')}</ChipListboxOption>
        <ChipListboxOption value="SMS">{channelLabel('SMS')}</ChipListboxOption>
      </FilterChipListbox>

      <FilterChipListbox
        label={t('settings.notificationTemplates.filter.audience')}
        ariaLabel={t('settings.notificationTemplates.filter.audience')}
        value={audienceFilter || null}
        displayValue={audienceFilter ? audienceLabel(audienceFilter) : null}
        resetLabel={t('settings.notificationTemplates.filter.allAudiences')}
        onChange={(v) => updateFilters({ audience: readAudience(v) })}
        onClear={() => updateFilters({ audience: '' })}
      >
        <ChipListboxOption value="CUSTOMER">{audienceLabel('CUSTOMER')}</ChipListboxOption>
        <ChipListboxOption value="INTERNAL">{audienceLabel('INTERNAL')}</ChipListboxOption>
      </FilterChipListbox>

      <FilterChipListbox
        label={t('settings.notificationTemplates.filter.status')}
        ariaLabel={t('settings.notificationTemplates.filter.status')}
        value={statusFilter || null}
        displayValue={statusFilter ? statusLabel(statusFilter) : null}
        resetLabel={t('settings.notificationTemplates.filter.allStatuses')}
        onChange={(v) => updateFilters({ status: readStatus(v) })}
        onClear={() => updateFilters({ status: '' })}
      >
        <ChipListboxOption value="system">{statusLabel('system')}</ChipListboxOption>
        <ChipListboxOption value="custom">{statusLabel('custom')}</ChipListboxOption>
      </FilterChipListbox>
    </>
  );

  return (
    <>
      <PageHead
        title={t('settings.nav.notificationTemplates')}
        sub={subtitle}
      />

      {templates && templates.length > 0 && (
        <ListToolbar
          className="max-sm:flex-col max-sm:items-stretch"
          search={
            <ListSearch
              placeholder={t(
                'settings.notificationTemplates.searchPlaceholder'
              )}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                updateFilters({ search: value }, { replace: true });
              }}
            />
          }
        >
          {/* Desktop: chips inline. `contents` keeps them as direct toolbar
              flex items so desktop layout is unchanged; hidden below sm. */}
          <div className="contents max-sm:hidden">{filterControls}</div>

          {/* Mobile: single Filters button that opens the bottom sheet */}
          <Button
            outline
            size="xs"
            className="sm:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <FunnelIcon className="size-3.5" />
            {t('settings.notificationTemplates.filter.filters')}
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {customizedCount > 0 && (
            <Text
              as="span"
              size="xs"
              tone="muted"
              className="ml-auto whitespace-nowrap max-sm:hidden"
            >
              <span className="font-semibold text-fg-accent">
                {customizedCount}
              </span>{' '}
              {t('settings.notificationTemplates.summary', {
                customized: customizedCount,
                systemDefault: systemDefaultCount,
              })}
            </Text>
          )}
        </ListToolbar>
      )}

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('settings.notificationTemplates.filter.filters')}
        onClearAll={clearFilters}
        clearAllLabel={t('settings.notificationTemplates.clearFilters')}
        clearAllDisabled={activeFilterCount === 0 && !searchQuery}
        doneLabel={t('common.done')}
      >
        {filterControls}
      </FiltersSheet>

      <div className="mt-4">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState
                label={t('common.actions.loading', {
                  entities: t('settings.notificationTemplates.nounPlural'),
                })}
              />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', {
                  entities: t('settings.notificationTemplates.nounPlural'),
                })}
                description={
                  extractApiError(error) ?? (error as Error).message
                }
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : !templates || templates.length === 0 ? (
              <EmptyState
                icon={<BellAlertIcon className="size-10 text-fg-dim" />}
                title={t('common.actions.noEntitiesYet', {
                  entities: t('settings.notificationTemplates.nounPlural'),
                })}
                description={t(
                  'settings.notificationTemplates.emptyDescription'
                )}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<BellAlertIcon className="size-10 text-fg-dim" />}
                title={t('common.actions.noMatchFilters', {
                  entities: t('settings.notificationTemplates.nounPlural'),
                })}
                description={t('common.actions.tryAdjustingFilters')}
                action={
                  <Button outline onClick={clearFilters}>
                    {t('settings.notificationTemplates.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th style={{ width: 90 }}>
                        {t('settings.notificationTemplates.table.channel')}
                      </th>
                      <th style={{ width: 100 }}>
                        {t('settings.notificationTemplates.table.audience')}
                      </th>
                      <th>
                        {t('settings.notificationTemplates.table.template')}
                      </th>
                      <th>
                        {t('settings.notificationTemplates.table.subject')}
                      </th>
                      <th style={{ width: 150 }}>
                        {t('settings.notificationTemplates.table.status')}
                      </th>
                      <th style={{ width: 70 }}>
                        {t('settings.notificationTemplates.table.version')}
                      </th>
                      <th style={{ width: 110 }}></th>
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {filtered.map((tpl) => (
                      <DenseRow
                        key={tpl.id}
                        onClick={() => handleOpen(tpl)}
                        className="cursor-pointer"
                      >
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-fg-muted">
                            {tpl.channel === 'EMAIL' ? (
                              <>
                                <EnvelopeIcon className="size-3.5" />
                                <span>{channelLabel('EMAIL')}</span>
                              </>
                            ) : (
                              <>
                                <ChatBubbleLeftIcon className="size-3.5" />
                                <span>{channelLabel('SMS')}</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="text-fg-muted">
                            {audienceLabel(tpl.audience)}
                          </span>
                        </td>
                        <td className="strong">
                          {(() => {
                            const updated = !tpl.isSystemTemplate
                              ? fmtUpdated(tpl)
                              : null;
                            if (updated) {
                              return (
                                <CellStack>
                                  <CellTop>{tpl.displayName}</CellTop>
                                  <CellSub>{updated}</CellSub>
                                </CellStack>
                              );
                            }
                            return tpl.displayName;
                          })()}
                        </td>
                        <td>
                          <span className="block max-w-[420px] truncate font-mono text-[11.5px] text-fg-muted">
                            {tpl.subject || '—'}
                          </span>
                        </td>
                        <td>
                          {tpl.isSystemTemplate ? (
                            <Pill tone="neutral">
                              {statusLabel('system')}
                            </Pill>
                          ) : (
                            <Pill tone="accent" dot>
                              {statusLabel('custom')}
                            </Pill>
                          )}
                        </td>
                        <td
                          className={
                            tpl.isSystemTemplate ? 'num muted' : 'num strong'
                          }
                        >
                          {t('settings.notificationTemplates.versionShort', {
                            version: tpl.version,
                          })}
                        </td>
                        <td className="right">
                          {canEdit && (
                            <span className="text-[11.5px] font-semibold text-fg-accent">
                              {tpl.isSystemTemplate
                                ? t(
                                    'settings.notificationTemplates.action.customize'
                                  )
                                : t(
                                    'settings.notificationTemplates.action.edit'
                                  )}{' '}
                              →
                            </span>
                          )}
                        </td>
                      </DenseRow>
                    ))}
                  </tbody>
                </DenseTable>
                {footerLeft && <ListFooter left={footerLeft} />}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
