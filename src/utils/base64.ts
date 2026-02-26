function hasTextEncoder(): boolean {
  return typeof TextEncoder !== "undefined" && typeof TextDecoder !== "undefined";
}

function hasAtobBtoa(): boolean {
  return typeof atob === "function" && typeof btoa === "function";
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(bytes.length, index + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeUtf8ToBase64(text: string): string {
  if (hasTextEncoder() && hasAtobBtoa()) {
    return encodeBytesToBase64(new TextEncoder().encode(text));
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64");
  }
  throw new Error("No UTF-8/base64 encoder runtime available.");
}

export function decodeBase64ToUtf8(base64: string): string {
  if (hasTextEncoder() && hasAtobBtoa()) {
    return new TextDecoder().decode(decodeBase64ToBytes(base64));
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  throw new Error("No UTF-8/base64 decoder runtime available.");
}

