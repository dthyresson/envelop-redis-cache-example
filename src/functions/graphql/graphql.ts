// Use a Netlify serverless function
import { Handler } from '@netlify/functions'

// Use a GraphQL Server with Helix + Envelop
import { envelop, useLogger, useSchema, useTiming } from '@envelop/core'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { getGraphQLParameters, processRequest, Response } from 'graphql-helix'

// Use the Response Cache envelop plugin with a Redis Cache
import { useResponseCache } from '@envelop/response-cache'
import { createRedisCache } from '@envelop/response-cache-redis'

import Redis from 'ioredis'

import { formatISO9075 } from 'date-fns'
import delay from 'delay'

// Create the Redis Cache
const redis = new Redis(process.env.REDIS)
const cache = createRedisCache({ redis })

// GraphQL Schema
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
      // let's simulate some sluggish queries to demonstrate caching by using delays
      fast: () => {
        return formatISO9075(Date.now())
      },
      quick: async () => {
        await delay(3500)
        return formatISO9075(Date.now())
      },
      slow: async () => {
        await delay(7000)
        return formatISO9075(Date.now())
      },
    },
  },
})

// Setup envelop and useful plugins like logging and adding timing traces
const getEnveloped = envelop({
  plugins: [
    useSchema(schema),
    useLogger(),
    useTiming(),
    useResponseCache({
      cache,
      ttl: 10000,
      includeExtensionMetadata: true,
      ttlPerSchemaCoordinate: {
        // cached execution results that select the `Query.hi` field become stale after 10ms
        'Query.hi': 10,
      },
    }),
  ],
  enableInternalTracing: true,
})

// The function handler is our serverless GraphQL "server"
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
