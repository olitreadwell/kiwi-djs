// One-time Discogs OAuth 1.0 setup: obtains the access token + secret that
// the Discogs scraper needs to read artist releases. Run with:
//   node --env-file=.env.local --import tsx scripts/discogs-auth.ts
// It prints an authorize URL; approve it in the browser and paste the
// 9-digit code back when prompted. The token is written to .env.local.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const API = 'https://api.discogs.com';
const AUTHORIZE_URL = 'https://www.discogs.com/oauth/authorize';

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthHeader(opts: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  params?: Record<string, string>;
}): string {
  const params: Record<string, string> = {
    ...(opts.params ?? {}),
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(opts.token ? { oauth_token: opts.token } : {}),
  };
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${opts.method.toUpperCase()}&${percentEncode(opts.url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(opts.consumerSecret)}&${percentEncode(opts.tokenSecret ?? '')}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');
  const headerParams: Record<string, string> = { ...params, oauth_signature: signature };
  return `OAuth ${Object.keys(headerParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`).join(', ')}`;
}

async function main(): Promise<void> {
  const consumerKey = process.env.DISCOGS_CONSUMER_KEY;
  const consumerSecret = process.env.DISCOGS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    console.error('Set DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET first (already in .env.local).');
    process.exit(1);
  }

  // Step 1: request token
  const requestTokenUrl = `${API}/oauth/request_token`;
  const requestRes = await fetch(requestTokenUrl, {
    method: 'POST',
    headers: {
      authorization: oauthHeader({ method: 'POST', url: requestTokenUrl, consumerKey, consumerSecret }),
      'user-agent': 'KiwiDJs/1.0 +https://kiwi-djs.vercel.app',
      'content-length': '0',
    },
    signal: AbortSignal.timeout(15000),
  });
  const requestBody = await requestRes.text();
  if (!requestRes.ok) {
    console.error(`Request token failed: HTTP ${requestRes.status} ${requestBody}`);
    process.exit(1);
  }
  const requestParams = new URLSearchParams(requestBody);
  const requestToken = requestParams.get('oauth_token');
  const requestTokenSecret = requestParams.get('oauth_token_secret');
  if (!requestToken || !requestTokenSecret) {
    console.error(`Request token missing: ${requestBody}`);
    process.exit(1);
  }

  const authorizeUrl = `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(requestToken)}`;
  console.log(`\nOpen this URL in your browser and approve the app:\n\n  ${authorizeUrl}\n`);
  spawnSync('open', [authorizeUrl]);

  const rl = createInterface({ input: stdin, output: stdout });
  const verifier = (await rl.question('Paste the 9-digit code from the page: ')).trim();
  rl.close();
  if (!/^\d{9}$/.test(verifier)) {
    console.error('Expected a 9-digit code.');
    process.exit(1);
  }

  // Step 2: exchange request token + verifier for an access token
  const accessTokenUrl = `${API}/oauth/access_token`;
  const accessRes = await fetch(accessTokenUrl, {
    method: 'POST',
    headers: {
      authorization: oauthHeader({
        method: 'POST',
        url: accessTokenUrl,
        consumerKey,
        consumerSecret,
        token: requestToken,
        tokenSecret: requestTokenSecret,
        params: { oauth_verifier: verifier },
      }),
      'user-agent': 'KiwiDJs/1.0 +https://kiwi-djs.vercel.app',
      'content-length': '0',
    },
    signal: AbortSignal.timeout(15000),
  });
  const accessBody = await accessRes.text();
  if (!accessRes.ok) {
    console.error(`Access token failed: HTTP ${accessRes.status} ${accessBody}`);
    process.exit(1);
  }
  const accessParams = new URLSearchParams(accessBody);
  const accessToken = accessParams.get('oauth_token');
  const accessTokenSecret = accessParams.get('oauth_token_secret');
  if (!accessToken || !accessTokenSecret) {
    console.error(`Access token missing: ${accessBody}`);
    process.exit(1);
  }

  // Step 3: persist to .env.local (and print masked confirmation)
  const envPath = new URL('../.env.local', import.meta.url).pathname;
  let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  for (const [name, value] of [
    ['DISCOGS_ACCESS_TOKEN', accessToken],
    ['DISCOGS_ACCESS_TOKEN_SECRET', accessTokenSecret],
  ] as const) {
    const line = `${name}=${value}`;
    env = env.includes(`${name}=`) ? env.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${env.trimEnd()}\n${line}`;
  }
  writeFileSync(envPath, env);
  console.log('\nSaved DISCOGS_ACCESS_TOKEN and DISCOGS_ACCESS_TOKEN_SECRET to .env.local');
  console.log(`token prefix: ${accessToken.slice(0, 6)}… | secret prefix: ${accessTokenSecret.slice(0, 6)}…`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
