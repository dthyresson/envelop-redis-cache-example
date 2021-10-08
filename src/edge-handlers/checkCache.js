// Log every incoming request URL
export function onRequest(event) {
  console.log(`Incoming request for ${event.requestMeta.url}`);
}
