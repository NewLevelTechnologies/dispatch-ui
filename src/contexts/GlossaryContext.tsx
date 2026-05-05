// Glossary Context - Tenant-specific entity names
/* eslint-disable react-refresh/only-export-components */
// Note: Exporting GLOSSARY_DEFAULTS and useGlossary alongside components is intentional
// for test mocking (DRY - single source of truth)
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Glossary, GlossaryEntry } from '../api';

/**
 * Default entity names (English).
 *
 * IMPORTANT: These should match backend EntityType enum exactly.
 * This is hardcoded (not fetched) for optimal performance.
 *
 * When adding a new entity:
 * 1. Backend adds to EntityType enum
 * 2. Add here with defaults
 * 3. Add to i18n (en_us.json entities section)
 * 4. Deploy together
 *
 * Exported for test mocking (DRY - single source of truth).
 */
export const GLOSSARY_DEFAULTS: Record<string, GlossaryEntry> = {
  customer: { singular: 'Customer', plural: 'Customers' },
  dispatch: { singular: 'Dispatch', plural: 'Dispatches' },
  division: { singular: 'Division', plural: 'Divisions' },
  equipment: { singular: 'Equipment', plural: 'Equipment' },
  equipment_component: { singular: 'Unit', plural: 'Units' },
  invoice: { singular: 'Invoice', plural: 'Invoices' },
  payment: { singular: 'Payment', plural: 'Payments' },
  quote: { singular: 'Quote', plural: 'Quotes' },
  route: { singular: 'Route', plural: 'Routes' },
  schedule: { singular: 'Schedule', plural: 'Schedules' },
  service_location: { singular: 'Service Location', plural: 'Service Locations' },
  technician: { singular: 'Technician', plural: 'Technicians' },
  work_item: { singular: 'Work Item', plural: 'Work Items' },
  work_order: { singular: 'Work Order', plural: 'Work Orders' },
};

interface GlossaryContextType {
  getName: (entityCode: string, plural?: boolean) => string;
  updateGlossary: (newOverrides: Glossary) => void;
}

const GlossaryContext = createContext<GlossaryContextType | undefined>(undefined);

interface GlossaryProviderProps {
  children: React.ReactNode;
  glossary?: Glossary; // Passed from tenant settings (already loaded)
}

export const GlossaryProvider: React.FC<GlossaryProviderProps> = ({
  children,
  glossary: initialGlossary = {}
}) => {
  const { t } = useTranslation();

  // Initialize immediately from already-loaded tenant settings
  // Deep merge to handle partial overrides (e.g., only singular customized)
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>(() => {
    const merged = { ...GLOSSARY_DEFAULTS };
    if (initialGlossary) {
      Object.keys(initialGlossary).forEach(entityCode => {
        const override = initialGlossary[entityCode];
        merged[entityCode] = {
          singular: override?.singular || GLOSSARY_DEFAULTS[entityCode]?.singular || entityCode,
          plural: override?.plural || GLOSSARY_DEFAULTS[entityCode]?.plural || entityCode + 's',
        };
      });
    }
    return merged;
  });

  /**
   * Update glossary with new overrides (called after saving settings).
   */
  const updateGlossary = (newOverrides: Glossary) => {
    const merged = { ...GLOSSARY_DEFAULTS };
    if (newOverrides) {
      Object.keys(newOverrides).forEach(entityCode => {
        const override = newOverrides[entityCode];
        merged[entityCode] = {
          singular: override?.singular || GLOSSARY_DEFAULTS[entityCode]?.singular || entityCode,
          plural: override?.plural || GLOSSARY_DEFAULTS[entityCode]?.plural || entityCode + 's',
        };
      });
    }
    setGlossary(merged);
  };

  /**
   * Get display name for an entity.
   *
   * Flow:
   * 1. Check glossary first (tenant override + defaults)
   * 2. Fall back to i18n (for future multi-language support)
   * 3. Last resort: formatted entity code
   *
   * @param entityCode - Backend entity code (snake_case, e.g., "customer", "service_location")
   * @param plural - Whether to return plural form
   * @returns Display name for the entity
   */
  const getName = (entityCode: string, plural = false): string => {
    // 1. Check glossary (includes both overrides and defaults)
    const entry = glossary[entityCode];
    if (entry) {
      return plural ? entry.plural : entry.singular;
    }

    // 2. Fall back to i18n (for future multi-language support)
    const i18nKey = plural
      ? `entities.${entityCode}s`
      : `entities.${entityCode}`;

    const translation = t(i18nKey);
    if (translation !== i18nKey) {
      return translation;
    }

    // 3. Last resort: formatted code (should rarely happen)
    console.warn(`Unknown entity code: ${entityCode}`);
    return entityCode.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <GlossaryContext.Provider value={{ getName, updateGlossary }}>
      {children}
    </GlossaryContext.Provider>
  );
};

/**
 * Hook to access glossary.
 *
 * Returns:
 * - getName(entityCode, plural): Get entity name (glossary override or default)
 * - updateGlossary(overrides): Update glossary after saving settings
 *
 * Note: Does NOT re-export t() - use useTranslation() directly for non-entity strings.
 */
export const useGlossary = () => {
  const context = useContext(GlossaryContext);

  if (!context) {
    throw new Error('useGlossary must be used within GlossaryProvider');
  }

  return context;
};
