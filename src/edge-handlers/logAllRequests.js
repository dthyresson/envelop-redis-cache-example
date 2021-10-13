// import { envelop } from '@envelop/core'
// import { getGraphQLParameters } from 'graphql-helix'

// import jsonStableStringify from 'fast-json-stable-stringify'

// const crypto = require('crypto')

/**
 * Default function used for building the response cache key.
 * It is exported here for advanced use-cases. E.g. if you want to short circuit and serve responses from the cache on a global level in order to completely by-pass the GraphQL flow.
 */
// const buildResponseCacheKey = params => crypto.createHash('sha1').update([params.documentString,
//   params.operationName ?? '',
//   jsonStableStringify(params.variableValues ?? {}),
//   params.sessionId ?? '',
// ].join('|')).digest('base64')

export const onRequest = (event) => {
  console.log(`incoming request for ${event.requestMeta.url.pathname}`)

  event.replaceResponse(async ({ request }) => {
    console.log(request.url, `url for ${event.requestMeta.url.pathname}`)

    const rawBody = request.body
    const decoder = new TextDecoder()
    let read = true
    let body = ''
    const reader = rawBody.getReader()
    while (read) {
      const chunk = await reader.read()

      console.log(chunk, `chunk for ${event.requestMeta.url.pathname}`)

      if (chunk) {
        console.log('trying to decode...')
        body += decoder.decode(chunk)
      } else {
        read = false
      }
    }

    body += decoder.decode()

    const url = new URL(request.url)

    const payload = {
      body,
      headers: event.requestMeta.headers,
      method: event.requestMeta.method,
      query: event.requestMeta.url,
    }
    console.log(payload, `payload for ${event.requestMeta.url.pathname}`)

    // url.pathname = `/api/v1/${url.pathname}`
    return fetch(url, { body: payload.body, headers: payload.headers, method: 'POST' })
  })

  // event.replaceResponse({ request } => {
  //   const payload = {
  //     body: request?.body,
  //     headers: event.requestMeta.headers,
  //     method: event.requestMeta.method,
  //     query: event.requestMeta.url,
  //   }
  //   console.log(payload, `payload for ${event.requestMeta.url.pathname}`)

  //   return fetch(request)
  // }})
}
