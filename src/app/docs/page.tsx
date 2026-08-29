export const metadata = { title: 'API docs | NZ DJs' };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black text-stone-100">API docs</h1>
      <p className="mt-2 font-mono text-xs text-stone-500">
        OpenAPI 3.1 spec at <a href="/api/openapi.json" className="text-amber-400 hover:underline">/api/openapi.json</a>
      </p>
      <div className="mt-8 overflow-hidden rounded-lg border border-stone-800">
        <iframe src="/docs/swagger" title="Swagger UI" className="h-[70vh] w-full bg-white" />
      </div>
    </div>
  );
}
