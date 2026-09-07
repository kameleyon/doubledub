import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Create account' };

/*
 * Rendered per request on purpose.
 *
 * The CSP is nonce-based, and a nonce only exists per request — a prerendered
 * page has no nonce to stamp onto its script tags, so with 'strict-dynamic'
 * the browser blocks every script and the page ships dead. Static generation
 * and a nonce CSP are mutually exclusive; the CSP wins.
 */
export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return <AuthForm mode="signup" />;
}
