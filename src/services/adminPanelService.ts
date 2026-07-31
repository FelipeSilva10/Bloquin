import { invoke } from '@tauri-apps/api/core';
import { supabase } from '../lib/supabase';
import { getCurrentSessionToken } from './sessionService';

const HANDOFF_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface AdminHandoffResponse {
  code?: unknown;
  actorId?: unknown;
  expiresAt?: unknown;
}

export class AdminPanelAccessError extends Error {
  constructor(
    public readonly code:
      | 'SESSION_MISSING'
      | 'SESSION_REPLACED'
      | 'NOT_AUTHORIZED'
      | 'HANDOFF_FAILED'
      | 'INVALID_HANDOFF',
  ) {
    super(code);
    this.name = 'AdminPanelAccessError';
  }
}

export async function openAdminPanel(expectedUserId: string): Promise<void> {
  const sourceSessionToken = getCurrentSessionToken();
  if (!sourceSessionToken) {
    throw new AdminPanelAccessError('SESSION_REPLACED');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session || session.user.id !== expectedUserId) {
    throw new AdminPanelAccessError('SESSION_MISSING');
  }

  const { data, error } = await supabase.functions.invoke<AdminHandoffResponse>(
    'admin-handoff-request',
    { body: { sessionToken: sourceSessionToken } },
  );

  if (error) {
    const status = typeof error === 'object' && error && 'context' in error
      ? (error.context as { status?: number } | undefined)?.status
      : undefined;
    throw new AdminPanelAccessError(
      status === 401 || status === 403 ? 'NOT_AUTHORIZED' : 'HANDOFF_FAILED',
    );
  }

  if (
    !data
    || typeof data.code !== 'string'
    || !HANDOFF_CODE_PATTERN.test(data.code)
    || data.actorId !== session.user.id
    || typeof data.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(data.expiresAt))
  ) {
    throw new AdminPanelAccessError('INVALID_HANDOFF');
  }

  await invoke('open_admin_panel', { handoffCode: data.code });
}

export async function closeAdminPanelWindow(): Promise<void> {
  try {
    await invoke('close_admin_panel');
  } catch {
    // O frontend também roda no navegador durante o desenvolvimento. A ausência
    // do runtime Tauri não pode impedir logout ou troca de usuário.
  }
}

export async function revokeAdminPanelAccess(): Promise<void> {
  const sourceSessionToken = getCurrentSessionToken();
  if (!sourceSessionToken) return;

  const { error } = await supabase.functions.invoke('admin-session-revoke', {
    body: { sessionToken: sourceSessionToken },
  });
  if (error) throw error;
}
