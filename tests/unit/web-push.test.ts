import { describe, expect, it } from "vitest";
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  createVerify,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import {
  buildVapidAuthorization,
  derSignatureToRaw,
  encryptPushPayload,
  generateVapidKeys,
  sendWebPush,
} from "@/server/domain/web-push";

/** RFC 8291 receiver side: recompute CEK/nonce and decrypt the aes128gcm body. */
function receiverDecrypt(body: Buffer, uaKeys: ReturnType<typeof createECDH>, auth: Buffer) {
  const asPublic = body.subarray(21, 21 + body[20]);
  const ciphertext = body.subarray(21 + body[20]);
  const shared = uaKeys.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaKeys.getPublicKey(), asPublic]);
  const cek = Buffer.from(hkdfSync("sha256", shared, auth, info, 16));
  const nonce = Buffer.from(hkdfSync("sha256", shared, auth, info, 12));
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

describe("generateVapidKeys", () => {
  it("produces a valid P-256 pair (public 65 bytes, private 32 bytes, matching point)", () => {
    const keys = generateVapidKeys();
    const publicRaw = Buffer.from(keys.publicKey, "base64url");
    const privateRaw = Buffer.from(keys.privateKey, "base64url");
    expect(publicRaw).toHaveLength(65);
    expect(publicRaw[0]).toBe(0x04);
    expect(privateRaw).toHaveLength(32);
    // Public point must derive from the private scalar.
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateRaw);
    expect(ecdh.getPublicKey().equals(publicRaw)).toBe(true);
  });

  it("produces distinct pairs", () => {
    expect(generateVapidKeys().publicKey).not.toEqual(generateVapidKeys().publicKey);
  });
});

describe("buildVapidAuthorization", () => {
  const keys = generateVapidKeys();
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

  it("returns a vapid header referencing the public key", () => {
    const header = buildVapidAuthorization(endpoint, "mailto:admin@school.vn", keys);
    expect(header.startsWith("vapid t=")).toBe(true);
    expect(header.endsWith(`, k=${keys.publicKey}`)).toBe(true);
  });

  it("signs a JWT verifiable with the public key (ES256 raw signature)", () => {
    const now = Date.parse("2026-09-10T00:00:00Z");
    const header = buildVapidAuthorization(endpoint, "mailto:admin@school.vn", keys, now);
    const token = header.slice("vapid t=".length, header.indexOf(", k="));

    const [headerB64, payloadB64, sigB64] = token.split(".");
    const signedPart = `${headerB64}.${payloadB64}`;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:admin@school.vn");
    expect(payload.exp).toBe(Math.floor(now / 1000) + 12 * 60 * 60);

    // Convert raw 64-byte r||s back to DER for node's verifier.
    const raw = Buffer.from(sigB64, "base64url");
    const der = rawToDer(raw.subarray(0, 32), raw.subarray(32, 64));
    const publicRaw = Buffer.from(keys.publicKey, "base64url");
    const jwk = {
      kty: "EC" as const,
      crv: "P-256",
      x: publicRaw.subarray(1, 33).toString("base64url"),
      y: publicRaw.subarray(33, 65).toString("base64url"),
    };
    const verify = createVerify("SHA256");
    verify.update(signedPart);
    expect(
      verify.verify(createPublicKey({ key: jwk, format: "jwk" }), der),
    ).toBe(true);
  });
});

describe("derSignatureToRaw", () => {
  it("round-trips a raw signature through DER encoding", () => {
    const r = randomBytes(32);
    const s = randomBytes(32);
    const der = rawToDer(r, s);
    expect(derSignatureToRaw(der).equals(Buffer.concat([r, s]))).toBe(true);
  });
});

describe("encryptPushPayload", () => {
  it("round-trips: the subscription holder can decrypt with their keys", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = randomBytes(16);
    const message = JSON.stringify({ title: "Thông báo", body: "Bạn có tiết dạy thay." });
    const { body } = encryptPushPayload(
      message,
      ua.getPublicKey("base64url"),
      auth.toString("base64url"),
    );
    // aes128gcm layout: salt(16) rs(4) idlen(1) key(65) ciphertext(+16 tag).
    expect(body).toHaveLength(16 + 4 + 1 + 65 + Buffer.byteLength(message) + 16);
    const decrypted = receiverDecrypt(body, ua, auth);
    expect(JSON.parse(decrypted)).toEqual({ title: "Thông báo", body: "Bạn có tiết dạy thay." });
  });

  it("rejects a malformed p256dh key", () => {
    expect(() =>
      encryptPushPayload("x", Buffer.from("short").toString("base64url"), "AAAAAAAAAAAAAAAAAAAAAA"),
    ).toThrow();
  });
});

describe("sendWebPush", () => {
  it("sends the encrypted body with VAPID headers and reports status", async () => {
    const keys = generateVapidKeys();
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = randomBytes(16);
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string | URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 201 });
    }) as typeof fetch;
    const result = await sendWebPush(
      {
        endpoint: "https://push.example.com/s/1",
        p256dh: ua.getPublicKey("base64url"),
        auth: auth.toString("base64url"),
      },
      { title: "T", body: "B", url: "/gv" },
      { ...keys, subject: "mailto:admin@school.vn" },
      fakeFetch,
    );
    expect(result).toEqual({ ok: true, gone: false, status: 201 });
    expect(calls[0].url).toBe("https://push.example.com/s/1");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization?.startsWith("vapid t=")).toBe(true);
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(calls[0].init.method).toBe("POST");
  });

  it("marks 404/410 as gone, network errors as retryable", async () => {
    const keys = generateVapidKeys();
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const target = {
      endpoint: "https://push.example.com/s/2",
      p256dh: ua.getPublicKey("base64url"),
      auth: randomBytes(16).toString("base64url"),
    };
    const gone = await sendWebPush(
      target,
      { title: "T", body: "B", url: "/gv" },
      { ...keys, subject: "mailto:a@b.c" },
      (async () => new Response("", { status: 410 })) as typeof fetch,
    );
    expect(gone.gone).toBe(true);
    expect(gone.ok).toBe(false);

    const offline = await sendWebPush(
      target,
      { title: "T", body: "B", url: "/gv" },
      { ...keys, subject: "mailto:a@b.c" },
      (async () => {
        throw new Error("offline");
      }) as typeof fetch,
    );
    expect(offline).toEqual({ ok: false, gone: false, status: 0 });
  });
});

/** Minimal DER ECDSA signature builder (INTEGER padding rules). */
function rawToDer(r: Buffer, s: Buffer): Buffer {
  const encode = (int: Buffer): Buffer => {
    let start = 0;
    while (start < int.length - 1 && int[start] === 0) start += 1;
    let bytes = Buffer.from(int.subarray(start));
    if (bytes[0] & 0x80) {
      bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
    }
    return Buffer.concat([Buffer.from([0x02, bytes.length]), bytes]);
  };
  const body = Buffer.concat([encode(r), encode(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}
