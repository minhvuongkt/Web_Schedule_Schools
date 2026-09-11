import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Web Push without the `web-push` package (npm install is blocked on this
 * machine — see AGENTS.md). Everything here uses Node's built-in crypto:
 *
 * - VAPID (RFC 8292): ES256 JWT with a raw `r||s` JWS signature.
 * - Message encryption (RFC 8291): ECDH key agreement + HKDF + AES-128-GCM,
 *   `aes128gcm` content coding (RFC 8188).
 *
 * Pure module: no DB, no IO — unit tested in tests/unit/web-push.test.ts.
 */

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. */
  publicKey: string;
  /** base64url, 32-byte private scalar. */
  privateKey: string;
}

/** Generates an application-server key pair for VAPID. */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey("base64url"),
    privateKey: ecdh.getPrivateKey("base64url"),
  };
}

// -- VAPID JWT --------------------------------------------------------------

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/** DER ECDSA signature → raw 64-byte `r||s` (JWS / ES256 wire format). */
export function derSignatureToRaw(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error("Invalid DER signature");
  let cursor = 2;
  if (der[cursor] !== 0x02) throw new Error("Invalid DER signature");
  const rLen = der[cursor + 1];
  const r = der.subarray(cursor + 2, cursor + 2 + rLen);
  cursor += 2 + rLen;
  if (der[cursor] !== 0x02) throw new Error("Invalid DER signature");
  const sLen = der[cursor + 1];
  const s = der.subarray(cursor + 2, cursor + 2 + sLen);
  const strip = (int: Buffer): Buffer => {
    let start = 0;
    while (start < int.length - 1 && int[start] === 0) start += 1;
    return int.subarray(start);
  };
  const pad = (int: Buffer): Buffer => {
    const out = Buffer.alloc(32);
    if (int.length > 32) throw new Error("Integer too large for P-256");
    int.copy(out, 32 - int.length);
    return out;
  };
  return Buffer.concat([pad(strip(r)), pad(strip(s))]);
}

function rawToJwkPrivate(keys: VapidKeys) {
  const publicKey = Buffer.from(keys.publicKey, "base64url");
  const privateKey = Buffer.from(keys.privateKey, "base64url");
  return {
    kty: "EC" as const,
    crv: "P-256",
    x: publicKey.subarray(1, 33).toString("base64url"),
    y: publicKey.subarray(33, 65).toString("base64url"),
    d: privateKey.toString("base64url"),
  };
}

/**
 * Builds the VAPID Authorization header value for a push endpoint.
 * @param endpoint the subscription endpoint URL (audience = its origin)
 */
export function buildVapidAuthorization(
  endpoint: string,
  subject: string,
  keys: VapidKeys,
  nowMs: number = Date.now(),
): string {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  const der = signer.sign(createPrivateKey({ key: rawToJwkPrivate(keys), format: "jwk" }));
  const jwt = `${unsigned}.${derSignatureToRaw(der).toString("base64url")}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

// -- RFC 8291 payload encryption ---------------------------------------------

export interface EncryptedPush {
  /** aes128gcm-coded body: salt(16) | rs(4) | idlen(1) | key(65) | ciphertext. */
  body: Buffer;
}

export interface EncryptOverrides {
  /**
   * Test-only: deterministic inputs to reproduce the RFC 8291 Appendix A
   * vectors. Production callers omit this.
   */
  senderPrivateKey?: Buffer;
  salt?: Buffer;
}

/** Encrypts a UTF-8 payload for one subscription (uaPublic + auth secret). */
export function encryptPushPayload(
  payload: string,
  p256dhBase64Url: string,
  authBase64Url: string,
  overrides: EncryptOverrides = {},
): EncryptedPush {
  const uaPublic = Buffer.from(p256dhBase64Url, "base64url");
  const authSecret = Buffer.from(authBase64Url, "base64url");
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("p256dh must be a 65-byte uncompressed P-256 point");
  }
  if (authSecret.length < 16) {
    throw new Error("auth secret must be at least 16 bytes");
  }

  const ecdh = createECDH("prime256v1");
  if (overrides.senderPrivateKey) {
    ecdh.setPrivateKey(overrides.senderPrivateKey);
  } else {
    ecdh.generateKeys();
  }
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  // RFC 8291 §3.4 — two-step HKDF:
  //   IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info\0"
  //              || ua_public || as_public, 32)
  //   PRK = HKDF-Extract(salt=header salt, IKM)
  //   CEK   = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  //   NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const salt = overrides.salt ?? randomBytes(16);
  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  // RFC 8188/8291: one record; the final padding delimiter 0x02 is mandatory
  // (browsers discard records whose delimiter is missing or not 0x02).
  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([0x02])]);
  if (plaintext.length > 4096 - 86 - 16) {
    throw new Error("Push payload too large (max ~4KB)");
  }
  const cipher = createCipheriv("aes-128-gcm", cek, nonce, { authTagLength: 16 });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const body = Buffer.concat([
    salt,
    Buffer.from([0x00, 0x00, 0x10, 0x00]), // rs = 4096
    Buffer.from([65]), // idlen
    asPublic,
    ciphertext,
  ]);
  return { body };
}

// -- Delivery ---------------------------------------------------------------

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  /** Subscription no longer exists at the push service (404/410). */
  gone: boolean;
  status: number;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** POSTs one encrypted push message to the subscription's push service. */
export async function sendWebPush(
  target: PushTarget,
  payload: PushPayload,
  vapid: { subject: string } & VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<PushSendResult> {
  const { body } = encryptPushPayload(JSON.stringify(payload), target.p256dh, target.auth);
  const authorization = buildVapidAuthorization(target.endpoint, vapid.subject, vapid);
  try {
    const response = await fetchImpl(target.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Urgency: "normal",
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(body),
    });
    return {
      ok: response.ok,
      gone: response.status === 404 || response.status === 410,
      status: response.status,
    };
  } catch {
    // Network failure — treat as retryable, never as "gone".
    return { ok: false, gone: false, status: 0 };
  }
}
