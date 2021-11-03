/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/// @ts-check
import http from 'k6/http'

const graphqlEndpoint =
  // eslint-disable-next-line no-undef
  __ENV.BENCHMARK_GRAPHQL_ENDPOINT || 'https://localhost/graphql'

export function checkNoErrors(resp) {
  return !('errors' in resp.json())
}

export function graphql({ query, operationName, variables }) {
  return http.post(
    graphqlEndpoint,
    JSON.stringify({
      query,
      operationName,
      variables,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        // eslint-disable-next-line no-undef
        'Response-Cache-Type': __ENV.MODE,
      },
    }
  )
}
