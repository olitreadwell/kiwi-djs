// Contract test: verifies the running server matches the OpenAPI spec.
// Usage: BASE_URL=http://localhost:3001 node scripts/contract-test.mjs

const base = process.env.BASE_URL ?? 'http://localhost:3001';

let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}`);
}

async function main() {
  const specRes = await fetch(`${base}/api/openapi.json`);
  if (!specRes.ok) throw new Error(`openapi.json HTTP ${specRes.status}`);
  const spec = await specRes.json();
  const paths = Object.keys(spec.paths ?? {});
  console.log(`Spec: ${spec.info.title} v${spec.info.version}, ${paths.length} paths`);
  check(spec.openapi === '3.1.0', 'spec openapi 3.1.0');
  check(paths.includes('/djs'), 'spec declares /djs');
  check(paths.some((p) => p.includes('{id}')), 'spec declares parameterized path');

  for (const path of paths) {
    const methods = Object.keys(spec.paths[path]);
    for (const method of methods) {
      if (method !== 'get') {
        check(false, `unexpected method ${method.toUpperCase()} on ${path}`);
        continue;
      }
      const operation = spec.paths[path][method];
      let resolvedPath = path;
      for (const param of operation.parameters ?? []) {
        if (param.in === 'path') {
          const value = path.includes('{id}') ? 'dick-johnson' : 'test';
          resolvedPath = resolvedPath.replace(`{${param.name}}`, value);
        }
      }
      const url = new URL(`${base}/api/v1${resolvedPath}`);
      for (const param of operation.parameters ?? []) {
        if (param.in === 'query' && param.required) url.searchParams.set(param.name, 'test');
      }
      const res = await fetch(url);
      check(res.status === 200, `GET ${path} → ${res.status}`);
    }
  }

  const djsRes = await fetch(`${base}/api/v1/djs`);
  const djs = await djsRes.json();
  check(Array.isArray(djs.data), '/api/v1/djs returns { data: [...] }');
  check(typeof djs.meta?.total === 'number', '/api/v1/djs returns meta.total');
  check(djs.data.every((dj) => typeof dj.id === 'string' && typeof dj.name === 'string'), 'every DJ has id + name');

  const detailRes = await fetch(`${base}/api/v1/djs/dick-johnson`);
  check(detailRes.status === 200, 'GET /api/v1/djs/{id} resolves');
  const missingRes = await fetch(`${base}/api/v1/djs/definitely-not-a-dj`);
  check(missingRes.status === 404, 'GET /api/v1/djs/{id} 404 for unknown');

  const datasetRes = await fetch(`${base}/api/v1/dataset`);
  const dataset = await datasetRes.json();
  check(dataset.djs?.length === djs.meta.total, `dataset.djs (${dataset.djs?.length}) == /djs total (${djs.meta.total})`);

  const csvRes = await fetch(`${base}/api/v1/dataset.csv`);
  const csv = await csvRes.text();
  const csvLines = csv.trim().split('\n');
  check(csvLines[0].toLowerCase().includes('name'), 'CSV has header row');
  check(csvLines.length - 1 === djs.meta.total, `CSV rows (${csvLines.length - 1}) == djs total (${djs.meta.total})`);
  check(csvRes.headers.get('content-type')?.includes('text/csv') ?? false, 'CSV content-type');

  const searchRes = await fetch(`${base}/api/v1/search?q=wellington`);
  check(searchRes.status === 200, 'GET /api/v1/search works');

  const metaRes = await fetch(`${base}/api/v1/dataset/meta`);
  const meta = await metaRes.json();
  check(metaRes.status === 200 && typeof meta.version === 'string', 'GET /api/v1/dataset/meta returns version');
  check(meta.counts?.djs === djs.meta.total, `dataset/meta counts.djs (${meta.counts?.djs}) == /djs total (${djs.meta.total})`);

  const etag = datasetRes.headers.get('etag');
  check(etag !== null, 'dataset response has ETag');
  const cachedRes = await fetch(`${base}/api/v1/dataset`, { headers: { 'if-none-match': etag ?? '' } });
  check(etag !== null && cachedRes.status === 304, 'dataset ETag round-trip returns 304');
  const csvEtag = csvRes.headers.get('etag');
  check(csvEtag !== null && csvEtag === etag, 'CSV ETag matches JSON dataset ETag');

  if (failures > 0) {
    console.error(`Contract test failed: ${failures} check(s).`);
    process.exit(1);
  }
  console.log('Contract test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
