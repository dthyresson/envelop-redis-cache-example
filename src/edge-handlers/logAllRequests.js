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

  event.replaceResponse(({ request }) => {
    const payload = {
      body: request?.body,
      headers: event.requestMeta.headers,
      method: event.requestMeta.method,
      query: event.requestMeta.url,
    }
    console.log(payload, `payload for ${event.requestMeta.url.pathname}`)

    return fetch(request)
  })
}
