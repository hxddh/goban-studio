/**
 * Read one of the app's own files (content parts, strings, the opening
 * book, sounds) by its relative URL.
 *
 * In the packaged app on macOS the WebView answers a request for the app's
 * own files (the zero://app scheme) with status 0 and no content type, but
 * with the whole file; Windows and a browser answer 200. A status of 0 is
 * therefore accepted when a body arrived (an empty one is not), and any
 * other status that is not "ok" is an error, as before.
 */

/** Whether a fetch response for a local file can be read. */
export function readable(r) {
  return !!r && (r.ok || r.status === 0);
}

/** @param {string} url @param {(url: string) => Promise<Response>} [get] */
export async function localText(url, get = (u) => fetch(u)) {
  const r = await get(url);
  if (!readable(r)) throw new Error(`${url}: ${r?.status}`);
  const text = await r.text();
  if (!text) throw new Error(`${url}: empty`);
  return text;
}

/** @param {string} url @param {(url: string) => Promise<Response>} [get] */
export async function localJson(url, get) {
  return JSON.parse(await localText(url, get));
}

/** @param {string} url @param {(url: string) => Promise<Response>} [get] */
export async function localBytes(url, get = (u) => fetch(u)) {
  const r = await get(url);
  if (!readable(r)) throw new Error(`${url}: ${r?.status}`);
  const data = await r.arrayBuffer();
  if (!data.byteLength) throw new Error(`${url}: empty`);
  return data;
}
