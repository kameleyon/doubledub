import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/rate-limit';

/**
 * Append-only record of privileged actions.
 *
 * `audit_log` has RLS forced and no policies, so it is written and read only
 * through the secret key. Members cannot read it, and — more importantly —
 * cannot delete their tracks from it.
 */

export type AuditAction =
  | 'admin.post.create'
  | 'admin.post.update'
  | 'admin.post.publish'
  | 'admin.post.delete'
  | 'admin.media.upload'
  | 'admin.member.suspend'
  | 'admin.member.grant_days'
  | 'admin.member.refund'
  | 'admin.comment.hide'
  | 'admin.role.grant'
  | 'admin.role.revoke'
  | 'billing.checkout.created'
  | 'billing.subscription.updated'
  | 'billing.subscription.canceled'
  | 'auth.signin.failed'
  | 'security.rate_limited'
  | 'security.forbidden';

export async function audit(
  action: AuditAction,
  opts: {
    actorId?: string | null;
    entity?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      actor_id: opts.actorId ?? null,
      action,
      entity: opts.entity ?? null,
      entity_id: opts.entityId ?? null,
      metadata: (opts.metadata ?? {}) as never,
      ip: await clientIp().then((ip) => (ip === 'unknown' ? null : ip)),
    });
  } catch (err) {
    // An audit write must never take down the action it is describing, but a
    // silent failure would defeat the purpose — so it is loud in the logs.
    console.error('[audit] failed to record', action, err);
  }
}
