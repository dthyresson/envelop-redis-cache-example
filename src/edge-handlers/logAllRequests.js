import jsonStableStringify from 'fast-json-stable-stringify'

// const crypto = require('crypto')

/**
 * Default function used for building the response cache key.
 * It is exported here for advanced use-cases. E.g. if you want to short circuit and serve responses from the cache on a global level in order to completely by-pass the GraphQL flow.
 */
// const buildResponseCacheKey = params => crypto.createHash('sha1').update([params.documentString,
//   // params.operationName ?? '',
//   // jsonStableStringify(params.variableValues ?? {}),
//   // params.sessionId ?? '',
// ].join('|')).digest('base64')

const buildResponseCacheKey = params => [params.documentString,
  params.operationName ?? '',
  jsonStableStringify(params.variableValues ?? {}),
  params.sessionId ?? '',
].join('|')

export const onRequest = (event) => {
  console.info(`incoming request for ${event.requestMeta.url.pathname}`)

  event.replaceResponse(async ({ request }) => {
    console.info(request.url, `url for ${event.requestMeta.url.pathname}`)

    const rawBody = request.body
    const decoder = new TextDecoder()
    let read = true
    let body = ''
    const reader = rawBody.getReader()

    while (read) {
      const chunk = await reader.read()

      console.debug(chunk, `chunk for ${event.requestMeta.url.pathname}`)

      if (!chunk.done) {
        console.debug('trying to decode...')
        body += decoder.decode(chunk.value)
      } else {
        read = false
      }
    }

    body += decoder.decode()

    const url = new URL(request.url)

    const params = {
      documentString: undefined,
      operationName: undefined,
      variableValues: undefined,
      sessionId: undefined
    }

    if (event.requestMeta.method === 'POST') {
      const req = JSON.parse(body)
      params.operationName = req?.operationName
      params.documentString = req?.query
      params.variableValues = req?.variables
    }

    const payload = {
      body,
      headers: event.requestMeta.headers,
      method: event.requestMeta.method,
      query: event.requestMeta.url,
    }

    console.debug(payload, `payload for ${event.requestMeta.url.pathname}`)

    console.debug({ params }, `GraphQL Parameters for ${event.requestMeta.url.pathname}`)

    try {
      const cacheKey = buildResponseCacheKey(params)
      console.debug(cacheKey, `cacheKey for ${event.requestMeta.url.pathname}`)
    } catch (error) {
      console.error(error)
    }

    return fetch(url, { body: payload.body, headers: payload.headers, method: 'POST' })
  })
}
