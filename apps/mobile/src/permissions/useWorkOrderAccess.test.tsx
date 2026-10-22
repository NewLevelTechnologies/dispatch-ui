import { renderHook } from '@testing-library/react-native';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useWorkOrderAccess } from './useWorkOrderAccess';

jest.mock('../hooks/useCurrentUser', () => ({ useCurrentUser: jest.fn() }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useWorkOrderAccess', () => {
  it('reads capabilities off the signed-in user', async () => {
    mockUseCurrentUser.mockReturnValue({ data: { id: 'me', capabilities: ['EDIT_ASSIGNED_WORK_ORDERS'] } });

    const { result } = await renderHook(() => useWorkOrderAccess('me'));

    expect(result.current.canEdit).toBe(true);
  });

  it('denies while the user query is still in flight', async () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined });

    const { result } = await renderHook(() => useWorkOrderAccess('me'));

    expect(result.current.canEdit).toBe(false);
  });
});
