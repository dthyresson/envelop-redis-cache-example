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
    type Post {
      id: Int!
      title: String!
      body: String!
    }

    type Query {
      post(id: Int!): Post!,
      posts: [Post]!,
      hi: String!
      fast: String!
      quick: String!
      slow: String
    }

    type Mutation {
      updatePost(id: Int!): Post
      invalidatePost(id: Int!): Post
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
      post: async (id) => {
        await delay(2000)
        return { id: 1, title: 'title1', body: 'body1'}
      },
      posts: async () => {
        await delay(2000)
        return [
          { id: 1, title: 'title1', body: 'body1' },
          { id: 2, title: 'title2', body: 'body2' },
          { id: 3, title: 'title3', body: 'body3' },
        ]
      },
    },
    Mutation: {
      updatePost: async ({ id }) => {
        await delay(2000)
        return { id: 1, title: 'title1', body: 'body1' }
      },
      invalidatePost: async (id) => {
        await delay(2000)
        return { id: 3, title: 'title3', body: 'body3' }
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
      // ttl: 10000,
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
