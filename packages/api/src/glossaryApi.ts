// Glossary API Client
import apiClient from './client';

export interface EntityInfo {
  code: string;
  defaultSingular: string;
  defaultPlural: string;
  description: string;
  // System-default abbreviation (e.g. "WO", "INV", "C"). Always present on the
  // available-entities response; the effective value falls back to this when a
  // tenant hasn't overridden the abbreviation.
  defaultAbbreviation: string;
}

export const glossaryApi = {
  /**
   * Get all available entity codes with defaults and descriptions.
   * ONLY used by Settings UI to show customization form.
   *
   * NOTE: Do NOT use this to load glossary at runtime!
   * Glossary comes from tenant settings, which are loaded at bootstrap.
   */
  getAvailableEntities: async (): Promise<EntityInfo[]> => {
    const response = await apiClient.get<EntityInfo[]>('/tenant-settings/glossary/available');
    return response.data;
  },
};

export default glossaryApi;
