// Glossary Context - Tenant-specific entity names
/* eslint-disable react-refresh/only-export-components */
// Note: Exporting GLOSSARY_DEFAULTS and useGlossary alongside components is intentional
// for test mocking (DRY - single source of truth)
import { createContext, useContext, useState } from 'react';
import { i18n, useTranslation } from '@dispatch/i18n';
import { GLOSSARY_DEFAULTS, glossaryVariables } from './glossaryVariables';
import type { Glossary, GlossaryEntry } from '../api/setup';

export { GLOSSARY_DEFAULTS };

/**
 * Makes the tenant's names default variables for every translation, so any
 * string can say `{{workOrders, lowercase}}` or `{{customer}}` without its
 * call site passing names. A param the call passes still wins.
 */
function publishToI18n(glossary: Record<string, GlossaryEntry>) {
  i18n.options.interpolation = { ...i18n.options.interpolation, defaultVariables: glossaryVariables(glossary) };
}
// Before any tenant loads (sign-in, public pages): the default names.
publishToI18n(GLOSSARY_DEFAULTS);

interface GlossaryContextType {
  getName: (entityCode: string, plural?: boolean) => string;
  // Short code for chips / number prefixes (e.g. "WI", "WO") — tenant override
  // from the glossary payload, else the built-in default, else first 2 letters.
  getAbbrev: (entityCode: string) => string;
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
          abbreviation: override?.abbreviation || GLOSSARY_DEFAULTS[entityCode]?.abbreviation,
        };
      });
    }
    publishToI18n(merged);
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
          abbreviation: override?.abbreviation || GLOSSARY_DEFAULTS[entityCode]?.abbreviation,
        };
      });
    }
    publishToI18n(merged);
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

  const getAbbrev = (entityCode: string): string => {
    const entry = glossary[entityCode];
    if (entry?.abbreviation) return entry.abbreviation;
    // Fall back to the first two letters of the (glossary) singular name.
    return getName(entityCode).replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || entityCode.slice(0, 2).toUpperCase();
  };

  return (
    <GlossaryContext.Provider value={{ getName, getAbbrev, updateGlossary }}>
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
