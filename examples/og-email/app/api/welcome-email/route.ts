import { isLocale } from 'next-tongue/server';
import { renderWelcomeEmail } from '../../../lib/render-welcome-email';
import { ensureTongue } from '../../../lib/tongue-runtime';

export const runtime = 'nodejs';

/** Route handler: locale comes from the JSON body (stored preference), not headers. */
export async function POST(req: Request) {
  ensureTongue();
  const body = (await req.json()) as {
    locale?: string;
    name?: string;
    createdAt?: string;
    timeZone?: string;
  };
  const locale = isLocale(body.locale) ? body.locale : 'en';
  const result = await renderWelcomeEmail(locale, {
    name: body.name ?? 'Ada',
    createdAt: body.createdAt ? new Date(body.createdAt) : new Date('2024-01-15T12:00:00Z'),
    timeZone: body.timeZone ?? 'UTC',
  });
  return Response.json(result);
}
