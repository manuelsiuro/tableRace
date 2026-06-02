// LAN discovery helpers: find the host's IP and print a scannable QR code +
// join URL to the terminal so phones can join by camera or by typing the URL.

import os from "node:os";
import qrcode from "qrcode";

/** First non-internal IPv4 address, or localhost. */
export function lanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

export function joinUrl(port: number): string {
  return `http://${lanIp()}:${port}/`;
}

/** Print the IP, URL, and a terminal QR code players can scan. */
export async function printJoinInfo(port: number): Promise<void> {
  const url = joinUrl(port);
  let qr = "";
  try {
    qr = await qrcode.toString(url, { type: "terminal", small: true });
  } catch {
    qr = "(QR unavailable)";
  }
  // eslint-disable-next-line no-console
  console.log(
    `\nTableRace host ready\n  Join from this machine: http://localhost:${port}/\n  Join from phones/LAN:   ${url}\n\n${qr}`,
  );
}
