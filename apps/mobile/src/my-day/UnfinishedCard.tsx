import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import type { QuoteListItem, WorkOrderSummary } from '@dispatch/api';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../components';

const SENT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function CarryRow({
  id,
  title,
  meta,
  onPress,
}: {
  id: string | null | undefined;
  title: string;
  meta: string;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: spacing.sm, backgroundColor: pressed ? colors.bgHover : 'transparent' },
      ]}
    >
      <View style={styles.main}>
        <Text numberOfLines={1} style={{ color: colors.fgStrong, fontSize: 13, fontWeight: '600' }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.fgMuted, fontSize: 11, marginTop: 1 }}>
          {[id, meta].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={{ color: colors.fgMuted }}>›</Text>
    </Pressable>
  );
}

/**
 * "What's hanging over me" — jobs waiting on parts and quotes the customer
 * hasn't answered. Renders nothing when both are empty: an empty card is
 * just noise on a phone screen.
 */
export function UnfinishedCard({
  awaitingParts,
  quotes,
  onOpenWorkOrder,
  onOpenQuote,
}: {
  awaitingParts: WorkOrderSummary[];
  quotes: QuoteListItem[];
  onOpenWorkOrder: (workOrderId: string) => void;
  onOpenQuote: (quote: QuoteListItem) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (awaitingParts.length + quotes.length === 0) return null;

  const rows = [
    ...awaitingParts.map((wo) => ({
      key: `wo-${wo.id}`,
      id: wo.workOrderNumber,
      title: wo.summary || wo.customer?.name || '',
      meta: t('myDay.unfinished.awaitingParts'),
      onPress: () => onOpenWorkOrder(wo.id),
    })),
    ...quotes.map((q) => ({
      key: `q-${q.id}`,
      id: q.quoteNumber,
      title: q.title || q.customerName || '',
      meta: q.quoteDate
        ? t('myDay.unfinished.sent', { date: SENT_DATE.format(new Date(q.quoteDate)) })
        : t('myDay.unfinished.quoteAwaiting', { quote: q.quoteNumber }),
      onPress: () => onOpenQuote(q),
    })),
  ];

  return (
    <Card title={t('myDay.unfinished.title')}>
      <View>
        {rows.map((row, i) => (
          <View
            key={row.key}
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSoft } : undefined}
          >
            <CarryRow id={row.id} title={row.title} meta={row.meta} onPress={row.onPress} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
});
