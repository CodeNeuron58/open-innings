export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    service: 'open-innings-web',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
