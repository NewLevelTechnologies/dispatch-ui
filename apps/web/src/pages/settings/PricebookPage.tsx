import { useDeferredValue, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { BookOpenIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import { pricebookApi, type PricebookItem, type PricebookItemType } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Button } from '../../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import IconButton from '../../components/IconButton';
import { InactiveToggle, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { PricebookCategoriesDialog } from '../../components/pricebook/PricebookCategoriesDialog';
import { ITEM_TYPES, categoryTree, itemMargin, toPercent } from '../../components/pricebook/pricebookModel';
import { CATEGORIES_KEY, ITEMS_KEY, toItemRequest, usePricebookError } from '../../components/pricebook/pricebookRequests';
import { LINE_TYPE_TONE } from '../../components/document/documentModel';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ListFooter } from '../../components/ui/ListFooter';
import { ListSearch, ListToolbar } from '../../components/ui/ListToolbar';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill, Tag } from '../../components/ui/Pill';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

const PAGE_SIZE = 50;

/**
 * The pricebook: services, parts, equipment and fees, at their list prices.
 * A category tree on the left narrows the list; search and a type filter
 * sit above it. Everyone can read it; changing it needs MANAGE_PRICING.
 * Items are never deleted, only deactivated.
 */
export default function PricebookPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const itemError = usePricebookError();
  const { page, pageHref, resetPage } = useUrlPage('page');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [type, setType] = useState<PricebookItemType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [showInactive, setShowInactive] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  const { data: categories = [] } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: () => pricebookApi.getCategories() });
  const tree = categoryTree(categories.filter((c) => c.active));
  // The categories response has no "All items" total, so one count call stands in for it.
  const { data: allActive } = useQuery({
    queryKey: [...ITEMS_KEY, { allActiveCount: true }],
    queryFn: () => pricebookApi.getItems({ active: true, size: 1 }),
  });
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  const filters = {
    q: q || undefined,
    type: type === 'ALL' ? undefined : type,
    categoryId: categoryId ?? undefined,
  };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...ITEMS_KEY, { ...filters, showInactive, page }],
    queryFn: () =>
      pricebookApi.getItems({ ...filters, active: showInactive ? undefined : true, page: page - 1, size: PAGE_SIZE, sort: 'name,asc' }),
    placeholderData: keepPreviousData,
  });
  const { data: inactive } = useQuery({
    queryKey: [...ITEMS_KEY, { ...filters, inactiveCount: true }],
    queryFn: () => pricebookApi.getItems({ ...filters, active: false, size: 1 }),
  });
  const items = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const filtering = !!(q || filters.type || categoryId);

  const update = useMutation({
    mutationFn: (item: PricebookItem) => pricebookApi.updateItem(item.id, toItemRequest(item, { active: !item.active })),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      showSuccess(t('settings.pricebook.toast.saved', { name: saved.name }));
    },
    onError: (err) => showError(t('settings.pricebook.toast.saveFailed'), itemError(err)),
  });

  const pick = (next: () => void) => {
    next();
    resetPage();
  };

  return (
    <>
      <PageHead
        title={t('settings.pricebook.title')}
        sub={t('settings.pricebook.description')}
        actions={
          canManage && (
            <Button color="accent" size="xs" href={categoryId ? `/settings/pricebook/new?category=${categoryId}` : '/settings/pricebook/new'}>
              <PlusIcon className="size-4" />
              {t('settings.pricebook.add')}
            </Button>
          )
        }
      />
      {!canManage && <ViewOnlyNotice />}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <Card className="max-lg:hidden">
          <CardHead>
            <CardTitle>{t('settings.pricebook.categories.title')}</CardTitle>
            <span className="flex-1" />
            {canManage && (
              <Button plain size="xs" onClick={() => setManagingCategories(true)}>
                {t('common.edit')}
              </Button>
            )}
          </CardHead>
          <nav aria-label={t('settings.pricebook.categories.title')} className="p-1">
            <CategoryButton
              label={t('settings.pricebook.allItems')}
              count={allActive?.totalElements}
              level={0}
              on={categoryId == null}
              onClick={() => pick(() => setCategoryId(null))}
            />
            {tree.map(({ category, level }) => (
              <CategoryButton
                key={category.id}
                label={category.name}
                count={category.activeItemCount}
                level={level + 1}
                on={categoryId === category.id}
                onClick={() => pick(() => setCategoryId(category.id))}
              />
            ))}
            {!tree.length && <p className="px-2.5 py-2 text-[11.5px] text-fg-muted">{t('settings.pricebook.categories.none')}</p>}
          </nav>
        </Card>

        <div className="min-w-0">
          <ListToolbar
            search={
              <ListSearch
                placeholder={t('settings.pricebook.searchPlaceholder')}
                value={search}
                onChange={(v) => pick(() => setSearch(v))}
              />
            }
          >
            <ToggleGroup value={type} onChange={(v) => pick(() => setType(v))} size="sm" aria-label={t('settings.pricebook.typeFilter')}>
              <ToggleGroupOption value="ALL">{t('settings.pricebook.allTypes')}</ToggleGroupOption>
              {ITEM_TYPES.map((it) => (
                <ToggleGroupOption key={it} value={it}>
                  {t(`settings.pricebook.type.${it}`)}
                </ToggleGroupOption>
              ))}
            </ToggleGroup>
          </ListToolbar>

          <Card>
            <CardHead>
              <CardTitle>{categoryName(categoryId) ?? t('settings.pricebook.allItems')}</CardTitle>
              {data && <CardSub>{total}</CardSub>}
              <span className="flex-1" />
              <InactiveToggle
                count={inactive?.totalElements ?? 0}
                shown={showInactive}
                onToggle={() => pick(() => setShowInactive((s) => !s))}
              />
            </CardHead>
            <CardBody flush>
              {isLoading ? (
                <LoadingState label={t('settings.pricebook.loading')} />
              ) : error ? (
                <ErrorState
                  title={t('settings.pricebook.loadFailed')}
                  description={extractApiError(error) ?? (error as Error).message}
                  action={
                    <Button outline onClick={() => refetch()}>
                      {t('common.actions.tryAgain')}
                    </Button>
                  }
                />
              ) : items.length === 0 ? (
                <EmptyState
                  icon={<BookOpenIcon className="size-10 text-fg-dim" />}
                  title={q ? t('settings.pricebook.noMatchTitle', { q }) : filtering ? t('settings.pricebook.emptyFilteredTitle') : t('settings.pricebook.emptyTitle')}
                  description={q ? t('settings.pricebook.noMatchDescription') : t('settings.pricebook.emptyDescription')}
                />
              ) : (
                <>
                  <DenseTable className="min-w-[820px]">
                    <DenseTHead>
                      <tr>
                        <th>{t('settings.pricebook.col.item')}</th>
                        <th>{t('settings.pricebook.col.pricing')}</th>
                        <th className="right">{t('settings.pricebook.col.price')}</th>
                        <th className="right">
                          <span className="inline-flex items-center gap-1.5">
                            {t('settings.pricebook.col.cost')} <Tag word>{t('settings.pricebook.internal')}</Tag>
                          </span>
                        </th>
                        <th className="right">{t('settings.pricebook.col.margin')}</th>
                        <th>{t('settings.pricebook.col.taxClass')}</th>
                        {canManage && <th style={{ width: 40 }} />}
                      </tr>
                    </DenseTHead>
                    <tbody>
                      {items.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          categoryName={categoryId == null ? categoryName(item.categoryId) : null}
                          canManage={canManage}
                          onOpen={() => navigate(`/settings/pricebook/${item.id}`)}
                          onDuplicate={() => navigate(`/settings/pricebook/new?from=${item.id}`)}
                          onToggleActive={() => update.mutate(item)}
                        />
                      ))}
                    </tbody>
                  </DenseTable>
                  <ListFooter
                    page={page}
                    totalPages={data?.totalPages ?? 1}
                    pageHref={pageHref}
                    left={t('settings.pricebook.showing', { count: items.length, total })}
                  />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <PricebookCategoriesDialog open={managingCategories} categories={categories} onClose={() => setManagingCategories(false)} />
    </>
  );
}

function CategoryButton({
  label,
  count,
  level,
  on,
  onClick,
}: {
  label: string;
  count?: number;
  level: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? 'true' : undefined}
      style={{ paddingLeft: 10 + level * 12 }}
      className={clsx(
        'flex w-full gap-2 rounded-sm py-1.5 pr-2.5 text-left !text-[12.5px]',
        on ? 'bg-bg-active !font-semibold text-fg-strong' : 'text-fg hover:bg-bg-hover',
      )}
    >
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-[11px] font-normal tabular-nums text-fg-muted">{count}</span>}
    </button>
  );
}

function ItemRow({
  item,
  categoryName,
  canManage,
  onOpen,
  onDuplicate,
  onToggleActive,
}: {
  item: PricebookItem;
  categoryName: string | null;
  canManage: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
}) {
  const { t } = useTranslation();
  const margin = itemMargin(item.unitPrice, item.unitCost);
  const markup = toPercent(item.markupPct) ?? 0;

  return (
    <DenseRow onClick={onOpen} className={item.active ? undefined : 'opacity-55'}>
      <td>
        <div className={clsx('text-[10px] font-bold uppercase tracking-[0.04em]', LINE_TYPE_TONE[item.itemType])}>
          {t(`settings.pricebook.type.${item.itemType}`)}
          {item.feeRole && ` · ${t(`settings.pricebook.feeRole.${item.feeRole}`)}`}
          {!item.active && ` · ${t('common.inactive')}`}
        </div>
        <div className="font-semibold text-fg-strong">{item.name}</div>
        {(item.sku || categoryName) && (
          <div className="text-[10.5px] text-fg-muted">
            {item.sku && <span className="font-mono">{item.sku}</span>}
            {item.sku && categoryName && ' · '}
            {categoryName}
          </div>
        )}
      </td>
      <td data-label={t('settings.pricebook.col.pricing')}>
        <div>{t(`settings.pricebook.mode.${item.pricingMode}`)}</div>
        {item.pricingMode === 'COMPUTED' && (
          <div className="text-[11px] tabular-nums text-fg-muted">
            {item.materialsCost
              ? t('settings.pricebook.computedDetail', {
                  hours: item.laborHours ?? 0,
                  cost: formatCurrency(item.materialsCost),
                  markup,
                })
              : t('settings.pricebook.computedLaborOnly', { hours: item.laborHours ?? 0 })}
          </div>
        )}
        {item.pricingMode === 'MARKUP' && item.unitCost != null && (
          <div className="text-[11px] tabular-nums text-fg-muted">
            {t('settings.pricebook.markupDetail', { cost: formatCurrency(item.unitCost), markup })}
          </div>
        )}
      </td>
      <td className="right num" data-label={t('settings.pricebook.col.price')}>
        {item.unitPrice == null ? (
          <Pill tone="warning">{t('settings.pricebook.needsRegularRate')}</Pill>
        ) : (
          <span className="font-semibold text-fg-strong">
            {formatCurrency(item.unitPrice)}
            <span className="text-[11px] font-normal text-fg-muted">/{item.unit}</span>
          </span>
        )}
      </td>
      <td className="right num" data-label={t('settings.pricebook.col.cost')}>
        {item.unitCost == null ? <span className="text-fg-muted">—</span> : formatCurrency(item.unitCost)}
      </td>
      <td className="right num" data-label={t('settings.pricebook.col.margin')}>
        {margin == null ? <span className="text-fg-muted">—</span> : `${margin}%`}
      </td>
      <td data-label={t('settings.pricebook.col.taxClass')}>{t(`settings.tax.class.${item.taxClass}`)}</td>
      {canManage && (
        <td className="right" onClick={(e) => e.stopPropagation()}>
          <Dropdown>
            <DropdownButton as={IconButton} aria-label={t('settings.pricebook.actionsFor', { name: item.name })}>
              <EllipsisVerticalIcon className="size-4" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={onOpen}>
                <DropdownLabel>{t('common.edit')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={onDuplicate}>
                <DropdownLabel>{t('settings.pricebook.duplicate')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={onToggleActive}>
                <DropdownLabel>{item.active ? t('settings.pricebook.deactivate') : t('settings.pricebook.activate')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </td>
      )}
    </DenseRow>
  );
}
