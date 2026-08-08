import { createPrivateKey, sign } from 'node:crypto';

const required = [
  'APP_STORE_CONNECT_API_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
  'APP_STORE_CONNECT_API_KEY_P8',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Secret GitHub manquant : ${name}`);
}

const base64url = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = base64url(
  JSON.stringify({
    alg: 'ES256',
    kid: process.env.APP_STORE_CONNECT_API_KEY_ID,
    typ: 'JWT',
  }),
);
const payload = base64url(
  JSON.stringify({
    iss: process.env.APP_STORE_CONNECT_ISSUER_ID,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  }),
);
const unsignedToken = `${header}.${payload}`;
const signature = sign('sha256', Buffer.from(unsignedToken), {
  key: createPrivateKey(process.env.APP_STORE_CONNECT_API_KEY_P8),
  dsaEncoding: 'ieee-p1363',
}).toString('base64url');
const token = `${unsignedToken}.${signature}`;

async function capabilities(identifier) {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/bundleIds');
  url.searchParams.set('filter[identifier]', identifier);
  url.searchParams.set('include', 'bundleIdCapabilities');
  url.searchParams.set('fields[bundleIds]', 'identifier,bundleIdCapabilities');
  url.searchParams.set('fields[bundleIdCapabilities]', 'capabilityType,settings');

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok) {
    const detail = body.errors
      ?.map((error) => error.detail)
      .filter(Boolean)
      .join(' · ');
    throw new Error(
      `Apple a refusé le contrôle de ${identifier} (${response.status})${detail ? ` : ${detail}` : ''}`,
    );
  }
  if (body.data?.length !== 1) {
    const appResponse = await fetch(
      'https://api.appstoreconnect.apple.com/v1/apps/6799259363?fields%5Bapps%5D=bundleId,name',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const appBody = await appResponse.json();
    const publishedIdentifier = appBody.data?.attributes?.bundleId ?? 'indisponible';
    console.warn(
      `Bundle ID de provisioning introuvable : ${identifier}. ` +
        `L’app App Store Connect utilise : ${publishedIdentifier}.`,
    );
    return null;
  }
  return {
    bundleIdId: body.data[0].id,
    enabled: (body.included ?? []).map((item) => item.attributes?.capabilityType).filter(Boolean),
  };
}

async function enableAppGroups(bundleIdId, identifier) {
  const response = await fetch('https://api.appstoreconnect.apple.com/v1/bundleIdCapabilities', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'bundleIdCapabilities',
        attributes: { capabilityType: 'APP_GROUPS' },
        relationships: { bundleId: { data: { type: 'bundleIds', id: bundleIdId } } },
      },
    }),
  });
  if (!response.ok) {
    const body = await response.json();
    const detail = body.errors
      ?.map((error) => error.detail)
      .filter(Boolean)
      .join(' · ');
    throw new Error(
      `Activation App Groups refusée pour ${identifier} (${response.status})${detail ? ` : ${detail}` : ''}`,
    );
  }
  console.log(`App Groups activé pour ${identifier}.`);
}

let verified = 0;
for (const identifier of ['com.n0thytvoff.Wattelier', 'com.n0thytvoff.Wattelier.Widgets']) {
  const result = await capabilities(identifier);
  if (result === null) continue;
  verified += 1;
  console.log(`${identifier} : ${result.enabled.join(', ') || 'aucune capacité'}`);
  if (!result.enabled.includes('APP_GROUPS')) {
    if (process.env.APPLE_CAPABILITIES_FIX === '1') {
      await enableAppGroups(result.bundleIdId, identifier);
    } else {
      throw new Error(`La capacité App Groups n’est pas activée pour ${identifier}`);
    }
  }
}

console.log(
  `App Groups contrôlé par l’API pour ${verified} App ID(s). La signature de l’IPA reste autoritaire.`,
);
