import { useQuery } from '@tanstack/react-query';
import { userApi, type User } from '../api';

/**
 * Hook to fetch and cache the current authenticated user's profile
 * Includes user information, roles, and capabilities for permission-based UI rendering
 */
export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: true, // Refresh when user switches back to the tab
  });
}

/**
 * Hook to check if the current user has a specific capability
 * @param capability - The capability name to check (e.g., 'VIEW_USERS', 'EDIT_CUSTOMERS')
 * @returns true if the user has the capability, false otherwise
 */
export function useHasCapability(capability: string): boolean {
  const { data: user } = useCurrentUser();
  return user?.capabilities?.includes(capability) ?? false;
}

/**
 * Hook to check if the current user has at least one of the specified capabilities
 * @param capabilities - Array of capability names to check
 * @returns true if the user has any of the capabilities, false otherwise
 */
export function useHasAnyCapability(...capabilities: string[]): boolean {
  const { data: user } = useCurrentUser();
  return capabilities.some(cap => user?.capabilities?.includes(cap)) ?? false;
}

/**
 * Hook to check if the current user has all of the specified capabilities
 * @param capabilities - Array of capability names to check
 * @returns true if the user has all of the capabilities, false otherwise
 */
export function useHasAllCapabilities(...capabilities: string[]): boolean {
  const { data: user } = useCurrentUser();
  return capabilities.every(cap => user?.capabilities?.includes(cap)) ?? false;
}
