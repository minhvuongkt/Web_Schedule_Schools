// Generates a VAPID key pair for Web Push (RFC 8292) using Node's crypto —
// no external packages. Prints .env lines to append. Run: npm run vapid:generate
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
console.log("VAPID_PUBLIC_KEY=" + ecdh.getPublicKey("base64url"));
console.log("VAPID_PRIVATE_KEY=" + ecdh.getPrivateKey("base64url"));
console.log("# Optional sender identity shown to push services:");
console.log("# VAPID_SUBJECT=mailto:admin@school.edu.vn");
