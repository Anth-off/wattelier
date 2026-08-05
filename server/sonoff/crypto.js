import crypto from 'node:crypto';

/** Chiffrement LAN eWeLink : AES-128-CBC, clé = MD5(devicekey), padding PKCS7. */

function aesKey(devicekey) {
  return crypto.createHash('md5').update(devicekey, 'utf8').digest();
}

export function encryptPayload(payload, devicekey) {
  const plaintext = Buffer.from(JSON.stringify(payload.data), 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', aesKey(devicekey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ...payload,
    encrypt: true,
    data: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptData(dataB64, ivB64, devicekey) {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    aesKey(devicekey),
    Buffer.from(ivB64, 'base64'),
  );
  let plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  // Certains firmwares terminent par des octets 0x02 parasites
  while (plain.length && plain[plain.length - 1] === 0x02) plain = plain.subarray(0, -1);
  return JSON.parse(plain.toString('utf8'));
}
