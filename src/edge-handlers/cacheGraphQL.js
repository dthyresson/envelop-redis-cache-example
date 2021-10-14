import SHA1 from 'crypto-js/sha1'
import Base64 from 'crypto-js/enc-base64'
import jsonStableStringify from 'fast-json-stable-stringify'

/**
 * Default function used for building the response cache key.
 * It is exported here for advanced use-cases. E.g. if you want to short circuit and serve responses from the cache on a global level in order to completely by-pass the GraphQL flow.
 */
const buildResponseCacheKey = (params) => {
  const tokens = [params.documentString,
    params.operationName ?? '',
    jsonStableStringify(params.variableValues ?? {}),
    params.sessionId ?? '',
  ].join('|')

  return Base64.stringify(SHA1(tokens))
}

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

const getGraphQLParameters = (body) => {
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

  return params
}

export const onRequest = (event) => {
  const requestPath = event.requestMeta.url.pathname
  const headers = event.headers

  console.info(`incoming request for ${requestPath}`)

  console.info(headers, `headers for ${requestPath}`)

  if (headers['response-cache-type'] === 'responseEdgeCache') {
    event.replaceResponse(async ({ request }) => {
      const body = await requestBody(request)
      const params = getGraphQLParameters(body)

      try {
        const cacheKey = buildResponseCacheKey(params)
        console.debug(cacheKey, `cacheKey for ${requestPath}`)

        // readonly redis fetch
        return fetch(`https://us1-sweet-anteater-34871.upstash.io/get/${cacheKey}`, {
          headers: {
            Authorization: 'Bearer Aog3ASQgYjU1YjU4YTktMWNjMy00MWI5LWJlNmEtMjE2YjEzNjMyNDcxtg-L28D3MZWzU0PhivQgG4kTbI1gCSnVCEkW5m9ho6c='
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

              return new Response(jsonStableStringify(responseResult), { headers, method: 'POST', status: 200 })
            } else {
              console.debug(`!!! No cachedResult found for ${cacheKey}. Forward to GraphQL request.`)

              return fetch(request.url, { body: body, headers, method: 'POST', status: 200 })
            }
          })
      } catch (error) {
        console.error(error, 'Failed to make cache key')
        console.error(error.message)
      }
    })
  }
}
