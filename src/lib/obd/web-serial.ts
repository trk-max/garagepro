/**
 * Real ELM327 adapter through the browser (Web Serial: Chrome / Edge on a
 * computer, page served over https or http://localhost). Works with USB
 * adapters and Bluetooth adapters paired with Windows (they appear as a COM port).
 * Wi-Fi (TCP) and BLE-only adapters are not supported by this transport.
 */
import { ObdError, type ObdTransport } from "@/lib/obd/session";

type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};
type SerialLike = { requestPort(): Promise<SerialPortLike> };

export function webSerialAvailable(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator && typeof window !== "undefined" && window.isSecureContext;
}

export async function openWebSerial(): Promise<ObdTransport> {
  if (!webSerialAvailable()) throw new ObdError("notSupported");
  const serial = (navigator as unknown as { serial: SerialLike }).serial;
  const port = await serial.requestPort();
  // ELM327 clones ship at 38400 (most), 9600 or 115200: try until "ATZ" answers.
  for (const baudRate of [38400, 9600, 115200]) {
    await port.open({ baudRate });
    const t = transportFor(port, `ELM327 (${baudRate} bauds)`);
    try {
      const r = await t.send("ATZ", 2500);
      if (/ELM|STN|OBD|v\d/i.test(r)) return t;
    } catch {
      /* wrong speed */
    }
    await t.close();
  }
  throw new ObdError("noAdapter");
}

function transportFor(port: SerialPortLike, label: string): ObdTransport {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  let buffer = "";
  let busy: Promise<unknown> = Promise.resolve();
  return {
    label,
    simulated: false,
    send(command, timeoutMs = 4000) {
      // One command at a time: the ELM327 is a strict request / prompt device.
      const run = busy.then(async () => {
        buffer = "";
        await writer.write(enc.encode(`${command}\r`));
        const deadline = Date.now() + timeoutMs;
        while (!buffer.includes(">")) {
          const left = deadline - Date.now();
          if (left <= 0) throw new ObdError("timeout", command);
          const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), left))]);
          if (!chunk) throw new ObdError("timeout", command);
          if (chunk.done) throw new ObdError("noAdapter", "port fermé");
          buffer += dec.decode(chunk.value);
        }
        return buffer;
      });
      busy = run.catch(() => undefined);
      return run;
    },
    async close() {
      try {
        reader.releaseLock();
        writer.releaseLock();
      } finally {
        await port.close().catch(() => {});
      }
    },
  };
}
