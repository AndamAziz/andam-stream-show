import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Panel } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  changeUserAccess,
  changeUserRole,
  changeUserSuspension,
  getProviders,
  getUsers,
} from '@/lib/admin.functions';

export const Route = createFileRoute('/_authenticated/admin/users')({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => getUsers() });
  const providers = useQuery({ queryKey: ['admin', 'providers'], queryFn: () => getProviders() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const onError = (e: Error) => setMessage(e.message);

  const role = useMutation({
    mutationFn: (v: { userId: string; role: 'admin' | 'user' }) => changeUserRole({ data: v }),
    onSuccess: () => {
      setMessage('Role updated.');
      invalidate();
    },
    onError,
  });

  const suspend = useMutation({
    mutationFn: (v: { userId: string; suspended: boolean }) => changeUserSuspension({ data: v }),
    onSuccess: () => {
      setMessage('Account access updated.');
      invalidate();
    },
    onError,
  });

  const access = useMutation({
    mutationFn: (v: { userId: string; sourceId: string; grant: boolean }) =>
      changeUserAccess({ data: v }),
    onSuccess: () => {
      setMessage('Provider access updated.');
      invalidate();
    },
    onError,
  });

  const list = (users.data ?? []).filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Users</h1>
      {message && <p className="mb-4 text-sm text-accent">{message}</p>}

      <Panel title="Registered accounts" description={`${users.data?.length ?? 0} accounts`}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name"
          className="mb-4 min-h-11 max-w-sm"
        />

        {users.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {list.map((u) => (
              <div key={u.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.email || u.displayName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      role: {u.role} · joined {new Date(u.createdAt).toLocaleDateString()} · last login{' '}
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}
                      {u.suspended ? ' · SUSPENDED' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() =>
                        role.mutate({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
                      }
                    >
                      {u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                    </Button>
                    <Button
                      size="sm"
                      variant={u.suspended ? 'default' : 'destructive'}
                      className="min-h-11"
                      onClick={() => suspend.mutate({ userId: u.id, suspended: !u.suspended })}
                    >
                      {u.suspended ? 'Restore access' : 'Suspend'}
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Provider access
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(providers.data ?? []).map((p) => {
                      const granted = u.sourceIds.includes(p.id);
                      return (
                        <Button
                          key={p.id}
                          size="sm"
                          variant={granted ? 'default' : 'secondary'}
                          className="min-h-11"
                          onClick={() =>
                            access.mutate({ userId: u.id, sourceId: p.id, grant: !granted })
                          }
                        >
                          {granted ? '✓ ' : ''}
                          {p.name}
                          {p.is_public ? ' (public)' : ''}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && <p className="text-sm text-muted-foreground">No matching users.</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}
