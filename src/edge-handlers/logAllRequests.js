import SHA1 from 'crypto-js/sha1'
import Base64 from 'crypto-js/enc-base64'
import jsonStableStringify from 'fast-json-stable-stringify'

/**
 * Default function used for building the response cache key.
 * It is exported here for advanced use-cases. E.g. if you want to short circuit and serve responses from the cache on a global level in order to completely by-pass the GraphQL flow.
 */
const buildResponseCacheKey = (params) => {
  console.debug({ params }, 'buildResponseCacheKey params')

  const tokens = [params.documentString,
    params.operationName ?? '',
    jsonStableStringify(params.variableValues ?? {}),
    params.sessionId ?? '',
  ].join('|')

  console.debug({ tokens }, 'buildResponseCacheKey tokens')

  return Base64.stringify(SHA1(tokens))
}

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

    try {
      const cacheKey = buildResponseCacheKey(params)
      console.debug(cacheKey, `cacheKey for ${event.requestMeta.url.pathname}`)

      // readonly redis fetch
      fetch(`https://us1-sweet-anteater-34871.upstash.io/get/${cacheKey}`, {
        headers: {
          Authorization: 'Bearer Aog3ASQgYjU1YjU4YTktMWNjMy00MWI5LWJlNmEtMjE2YjEzNjMyNDcxtg-L28D3MZWzU0PhivQgG4kTbI1gCSnVCEkW5m9ho6c='
        }
      }).then(response => response.json())
        .then(data => {
          console.debug(data, `cachedResult for ${cacheKey}`)

          if (data?.result) {
            console.debug(`+++ Found for for ${cacheKey}.`)
            return new Response(data.result, { method: 'POST', status: '200' })
          } else {
            console.debug(`!!! No cachedResult found for ${cacheKey}. Make GraphQL request.`)
            return fetch(url, { body: payload.body, headers: payload.headers, method: 'POST' })
          }
        })
    } catch (error) {
      console.error(error, 'Failed to make cache key')
      console.error(error.message)
    }
  })
}
