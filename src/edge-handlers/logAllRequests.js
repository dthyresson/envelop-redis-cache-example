export function onRequest(event) {
  console.log(`incoming request for ${event.requestMeta.url.pathname}`);
}
