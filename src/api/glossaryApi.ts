// Glossary API Client
import apiClient from './client';

export interface EntityInfo {
  code: string;
  defaultSingular: string;
  defaultPlural: string;
  description: string;
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
