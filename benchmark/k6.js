/* eslint-disable no-undef */
import { check } from 'k6'
import { graphql, checkNoErrors } from './utils.js'
import { Counter, Trend } from 'k6/metrics'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js'

const DURATION = 10
const VUS = 4

function buildOptions(scenarioToThresholdsMap) {
  const result = {
    scenarios: {},
    thresholds: {},
  }

  let index = 0

  for (const [scenario, thresholds] of Object.entries(
    scenarioToThresholdsMap
  )) {
    result.scenarios[scenario] = {
      executor: 'constant-vus',
      exec: 'run',
      startTime: DURATION * index + 's',
      vus: VUS,
      duration: DURATION + 's',
      env: { MODE: scenario },
      tags: { mode: scenario },
    }

    const t = Object.keys(thresholds || {}).reduce((prev, key) => {
      return Object.assign({}, prev, {
        [`${key}{mode:${scenario}}`]: thresholds[key],
      })
    }, {})

    Object.assign(result.thresholds, t)
    index++
  }

  return result
}

const counter = {
  hits: new Counter('response_cache_hits'),
  misses: new Counter('response_cache_misses'),
}

const trace = {
  init: new Trend('envelop_init', true),
  parse: new Trend('graphql_parse', true),
  validate: new Trend('graphql_validate', true),
  context: new Trend('graphql_context', true),
  execute: new Trend('graphql_execute', true),
  total: new Trend('envelop_total', true),
}

export const options = buildOptions({
  responseCache: {
    no_errors: ['rate=1.0'],
    expected_result: ['rate=1.0'],
    http_req_duration: ['p(95)<=120'],
    graphql_execute: ['p(95)<=100'],
    // graphql_context: ['p(95)<=1'],
    // graphql_validate: ['p(95)<=1'],
    // graphql_parse: ['p(95)<=1'],
    // envelop_init: ['p(95)<=1'],
    // envelop_total: ['p(95)<=2'],
    // event_loop_lag: ['avg==0', 'p(99)==0'],
    response_cache_hits: ['count > 1'],
    response_cache_misses: ['count <= 2'],
  },
  responseEdgeCache: {
    no_errors: ['rate=1.0'],
    expected_result: ['rate=1.0'],
    http_req_duration: ['p(95)<=100'],
    graphql_execute: ['p(95)<=100'],
    // graphql_context: ['p(95)<=1'],
    // graphql_validate: ['p(95)<=1'],
    // graphql_parse: ['p(95)<=1'],
    // envelop_init: ['p(95)<=1'],
    // envelop_total: ['p(95)<=2'],
    // event_loop_lag: ['avg==0', 'p(99)==0'],
    response_cache_hits: ['count > 1'],
    response_cache_misses: ['count <= 2'],
  },
})

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    './benchmark/summary.txt': textSummary(data, {
      indent: ' ',
      enableColors: false,
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function run() {
  const res = graphql({
    query: /* GraphQL */ `
      query quick {
        quick
      }
    `,
    variables: {},
    operationName: 'quick',
  })

  const extensions = res.json().extensions || {}
  const tracingData = extensions.envelopTracing || {}
  tracingData.parse && trace.parse.add(tracingData.parse)
  tracingData.validate && trace.validate.add(tracingData.validate)
  tracingData.contextFactory && trace.context.add(tracingData.contextFactory)
  tracingData.execute && trace.execute.add(tracingData.execute)
  tracingData.subscribe && trace.subscribe.add(tracingData.subscribe)
  tracingData.init && trace.init.add(tracingData.init)

  const total = [
    tracingData.parse,
    tracingData.validate,
    tracingData.contextFactory,
    tracingData.execute,
    tracingData.subscribe,
    tracingData.init,
  ]
    .filter(Boolean)
    .reduce((a, b) => a + b, 0)

  trace.total.add(total)

  const responseCacheData = extensions.responseCache || {}
  const responseEdgeCacheData = extensions.responseEdgeCache || {}

  if (responseCacheData && responseCacheData.hit === true) {
    counter.hits.add(1)
  }
  if (responseEdgeCacheData && responseEdgeCacheData.hit === true) {
    counter.hits.add(1)
  }

  if (responseCacheData && responseCacheData.hit === false) {
    counter.misses.add(1)
  }
  if (responseEdgeCacheData && responseEdgeCacheData.hit === false) {
    counter.misses.add(1)
  }

  check(res, {
    no_errors: checkNoErrors,
    expected_result: (resp) => {
      const data = resp.json().data
      return data
    },
  })
}
