import { envelop, useLogger, useSchema, useTiming } from '@envelop/core'
import { useResponseCache } from '@envelop/response-cache'
import { createRedisCache } from '@envelop/response-cache-redis'

import Redis from 'ioredis'

import { makeExecutableSchema } from '@graphql-tools/schema'
import { Handler } from '@netlify/functions'
import { getGraphQLParameters, processRequest, Response } from 'graphql-helix'

import delay from 'delay'
import { formatISO9075 } from 'date-fns'

const redis = new Redis(
  process.env.REDIS
)

const cache = createRedisCache({ redis })

const schema = makeExecutableSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      hi: String!
      fast: String!
      quick: String!
      slow: String
    }
  `,
  resolvers: {
    Query: {
      hi: () => 'there',
      fast: () => {
        return formatISO9075(Date.now())
      },
      quick: async () => {
        await delay(1500)
        return formatISO9075(Date.now())
      },
      slow: async () => {
        await delay(3000)
        return formatISO9075(Date.now())
      },
    },
  },
})

const getEnveloped = envelop({
  plugins: [
    useSchema(schema),
    useLogger(),
    useTiming(),
    useResponseCache({ cache, ttl: 10000, includeExtensionMetadata: true }),
  ],
  enableInternalTracing: true,
})

export const handler: Handler = async (event) => {
  const { parse, validate, contextFactory, execute, schema } = getEnveloped({
    req: event,
  })
  const request = {
    body: JSON.parse(event.body),
    headers: event.headers,
    method: event.httpMethod,
    query: event.queryStringParameters,
  }

  const { operationName, query, variables } = getGraphQLParameters(request)
  const result = (await processRequest({
    operationName,
    query,
    variables,
    request,
    schema,
    parse,
    validate,
    execute,
    contextFactory,
  })) as Response<any, any>

  return {
    statusCode: 200,
    headers: result.headers.reduce(
      (prev, item) => ({ ...prev, [item.name]: item.value }),
      {}
    ),
    body: JSON.stringify(result.payload),
  }
}
