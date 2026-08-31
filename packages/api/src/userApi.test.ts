import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userApi } from './userApi';
import apiClient from './client';

vi.mock('./client');

function makeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    tenantId: 't-1',
    cognitoSub: 'sub',
    email: 'me@example.com',
    firstName: 'Tenant',
    lastName: 'Two',
    phoneNumber: '6783624291',
    photoUrl: null,
    enabled: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...over,
  };
}

describe('userApi self-service endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateMyProfile PUTs /users/me with the patch body', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: makeUser({ firstName: 'Updated' }) });

    const result = await userApi.updateMyProfile({
      firstName: 'Updated',
      lastName: 'Two',
      phoneNumber: '6783624291',
    });

    expect(apiClient.put).toHaveBeenCalledWith('/users/me', {
      firstName: 'Updated',
      lastName: 'Two',
      phoneNumber: '6783624291',
    });
    expect(result.firstName).toBe('Updated');
  });

  it('uploadMyPhoto POSTs multipart to /users/me/photo with the file field', async () => {
    const updated = makeUser({ photoUrl: 'https://cdn/x.png' });
    vi.mocked(apiClient.post).mockResolvedValue({ data: updated });

    const file = new File(['fake'], 'me.png', { type: 'image/png' });
    const result = await userApi.uploadMyPhoto(file);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/users/me/photo');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((config as { headers?: Record<string, string> })?.headers).toMatchObject({
      'Content-Type': 'multipart/form-data',
    });
    expect(result.photoUrl).toBe('https://cdn/x.png');
  });

  it('deleteMyPhoto DELETEs /users/me/photo and returns the updated user', async () => {
    const updated = makeUser({ photoUrl: null });
    vi.mocked(apiClient.delete).mockResolvedValue({ data: updated });

    const result = await userApi.deleteMyPhoto();

    expect(apiClient.delete).toHaveBeenCalledWith('/users/me/photo');
    expect(result.photoUrl).toBeNull();
  });
});

// Empty envelope used by the search URL-shape tests below — we don't care
// about the body, only the URL the request landed on.
const emptyPage = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  counts: { disabled: 0, invited: 0 },
};

function lastGetUrl(): string {
  const calls = vi.mocked(apiClient.get).mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('userApi.searchUsers URL shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: emptyPage });
  });

  it('hits /users with no query string when params are empty', async () => {
    await userApi.searchUsers();
    expect(lastGetUrl()).toBe('/users');
  });

  it('sets q, page, and size as scalar params', async () => {
    await userApi.searchUsers({ q: 'jane', page: 2, size: 50 });
    const url = lastGetUrl();
    const params = new URL(`http://x${url}`).searchParams;
    expect(params.get('q')).toBe('jane');
    expect(params.get('page')).toBe('2');
    expect(params.get('size')).toBe('50');
  });

  it('encodes enabled=true and enabled=false as strings, omits when undefined', async () => {
    await userApi.searchUsers({ enabled: true });
    expect(new URL(`http://x${lastGetUrl()}`).searchParams.get('enabled')).toBe('true');

    await userApi.searchUsers({ enabled: false });
    expect(new URL(`http://x${lastGetUrl()}`).searchParams.get('enabled')).toBe('false');

    await userApi.searchUsers({});
    expect(new URL(`http://x${lastGetUrl()}`).searchParams.has('enabled')).toBe(false);
  });

  it('serializes roleId and invitationStatus as repeated keys for OR semantics', async () => {
    await userApi.searchUsers({
      roleId: ['role-a', 'role-b'],
      invitationStatus: ['INVITED', 'INVITATION_EXPIRED'],
    });
    const params = new URL(`http://x${lastGetUrl()}`).searchParams;
    expect(params.getAll('roleId')).toEqual(['role-a', 'role-b']);
    expect(params.getAll('invitationStatus')).toEqual(['INVITED', 'INVITATION_EXPIRED']);
  });

  it('drops empty arrays so the URL stays clean', async () => {
    await userApi.searchUsers({ roleId: [], invitationStatus: [] });
    const url = lastGetUrl();
    expect(url).toBe('/users');
  });

  it('unwraps the envelope and returns content + paging metadata to callers', async () => {
    const envelope = {
      content: [makeUser()],
      page: 1,
      size: 50,
      totalElements: 137,
      totalPages: 3,
      counts: { disabled: 5, invited: 12 },
    };
    vi.mocked(apiClient.get).mockResolvedValue({ data: envelope });

    const result = await userApi.searchUsers({ page: 1 });
    expect(result.content).toHaveLength(1);
    expect(result.totalElements).toBe(137);
    expect(result.counts?.disabled).toBe(5);
    expect(result.counts?.invited).toBe(12);
  });
});

describe('userApi.listRoleMembers URL shape', () => {
  const memberPage = {
    content: [],
    page: 0,
    size: 25,
    totalElements: 0,
    totalPages: 0,
    counts: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: memberPage });
  });

  it('hits /users/roles/{id}/members with no query string when params are empty', async () => {
    await userApi.listRoleMembers('role-1');
    expect(lastGetUrl()).toBe('/users/roles/role-1/members');
  });

  it('forwards q, page, size, and sort when provided', async () => {
    await userApi.listRoleMembers('role-1', { q: 'jane', page: 1, size: 25, sort: 'lastName,asc' });
    const params = new URL(`http://x${lastGetUrl()}`).searchParams;
    expect(params.get('q')).toBe('jane');
    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('25');
    expect(params.get('sort')).toBe('lastName,asc');
  });
});
