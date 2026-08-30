export const metadata = { title: 'API docs | Kiwi DJs' };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-foreground">API docs</h1>
      <p className="mt-2 font-mono text-xs text-muted">
        OpenAPI 3.1 spec at <a href="/api/openapi.json" className="text-accent hover:underline">/api/openapi.json</a>
      </p>
      <div className="mt-8 overflow-hidden rounded-lg border border-edge">
        <iframe src="/docs/swagger" title="Swagger UI" className="h-[70vh] w-full bg-white" />
      </div>
    </div>
  );
}
