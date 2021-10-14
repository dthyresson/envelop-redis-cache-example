import SHA1 from 'crypto-js/sha1'
import Base64 from 'crypto-js/enc-base64'
import jsonStableStringify from 'fast-json-stable-stringify'

const REDIS_READONLY = 'Bearer Aog3ASQgYjU1YjU4YTktMWNjMy00MWI5LWJlNmEtMjE2YjEzNjMyNDcxtg-L28D3MZWzU0PhivQgG4kTbI1gCSnVCEkW5m9ho6c='

/**
 * Default function used for building the response cache key.
 */
const buildResponseCacheKey = (params) => {
  const tokens = [params.documentString,
    params.operationName ?? '',
    jsonStableStringify(params.variableValues ?? {}),
    params.sessionId ?? '',
  ].join('|')

  return Base64.stringify(SHA1(tokens))
}

/**
 * In an Edge Handler, the request body is not readily available to reduce size and latency.
 * In order to fetch the body, you need th read and decode it from a stream.
 *
 * @param {*} request
 * @returns the request body as a string
 */
const requestBody = async (request) => {
  const rawBody = request.body
  const decoder = new TextDecoder()
  let read = true
  let body = ''
  const reader = rawBody.getReader()

  while (read) {
    const chunk = await reader.read()

    if (!chunk.done) {
      body += decoder.decode(chunk.value)
    } else {
      read = false
    }
  }

  body += decoder.decode()

  return body
}

/**
 * Extracts GraphQL parameters from a request body: documentString, operationName, variableValues.
 * Doesn't handle auth/sessions.
 *
 * @param {*} body
 * @returns params
 */
const getGraphQLParameters = (body) => {
  const parsedBody = JSON.parse(body)

  return {
    documentString: parsedBody?.query,
    operationName: parsedBody?.operationName,
    variableValues: parsedBody?.variables,
    sessionId: undefined
  }
}

/**
 * Fetches a cached GraphQL execution result if present, otherwise pass through to the GraphQL serverless function
 *
 * @param {*} event
 */
export const onRequest = (event) => {
  const requestPath = event.requestMeta.url.pathname
  const method = event.requestMeta.method
  const cacheType = event.requestMeta.headers.get('Response-Cache-Type')

  console.info(`incoming request for ${requestPath}`)

  console.info(cacheType, `cacheType for ${requestPath}`)

  if (method === 'POST' && cacheType === 'responseEdgeCache') {
    event.replaceResponse(async ({ request }) => {
      const body = await requestBody(request)
      const params = getGraphQLParameters(body)

      try {
        const cacheKey = buildResponseCacheKey(params)
        console.debug(cacheKey, `cacheKey for ${requestPath}`)

        // readonly redis fetch
        return fetch(`https://us1-sweet-anteater-34871.upstash.io/get/${cacheKey}`, {
          headers: {
            Authorization: REDIS_READONLY
          }
        }).then(response => response.json())
          .then(data => {
            if (data?.result) {
              const parsedResult = JSON.parse(data.result)
              const responseResult = {
                ...parsedResult,
                extensions: {
                  responseEdgeCache: {
                    hit: true
                  }
                }
              }

              console.debug(jsonStableStringify(responseResult), `+++ Found for ${cacheKey}.`)

              return new Response(jsonStableStringify(responseResult), { method: 'POST', headers: { cacheKey }, status: 200 })
            } else {
              console.debug(body, `!!! No cachedResult found for ${cacheKey}. Forward body to GraphQL request.`)

              return fetch(request.url, { body: body, method: 'POST', status: 200 })
            }
          })
      } catch (error) {
        console.error(error, 'Failed to make cache key')
        console.error(error.message)
      }
    })
  }
}
