import { generateVapidKeys } from "@mmmike/web-push/vapid";

const { publicKey, privateKey } = await generateVapidKeys();

process.stdout.write([
  "Generate these once, then store them as Cloudflare Worker secrets.",
  `VAPID_PUBLIC_KEY=${publicKey}`,
  `VAPID_PRIVATE_KEY=${privateKey}`,
  "Do not commit or paste the private key into GitHub variables.",
  "",
].join("\n"));
