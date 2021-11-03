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

    input PostUpdate {
      title: String!
      body: String
    }

    type Query {
      post(id: Int!): Post!
      posts: [Post]!
      hi: String!
      fast: String!
      quick: String!
      slow: String
    }

    type Mutation {
      updatePost(id: Int!, input: PostUpdate!): Post
      invalidatePost(id: Int!): Boolean
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
      post: async (_, { id }) => {
        await delay(2000)
        return { id: id, title: `title${id}`, body: `body${id}` }
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
      updatePost: async (_, { id, input }) => {
        return {
          id: id,
          title: `${input.title || 'title'}${id}`,
          body: `${input.body || 'body'}${id}`,
        }
      },

      invalidatePost: async (_, { id }) => {
        await cache.invalidate([{ typename: 'Post', id: id }])
        return true
      },
    },
  },
})

const EXPIRE_IN_SECONDS =
  (process.env.EXPIRE_IN_SECONDS && parseInt(process.env.EXPIRE_IN_SECONDS)) ||
  30

const enableCache = (context) => {
  const enabled = context.request.headers['enable-response-cache']
  if (enabled && enabled === 'true') return true
  if (enabled && enabled !== 'true') return false
  return true
}

// Setup envelop and useful plugins like logging and adding timing traces
const getEnveloped = envelop({
  plugins: [
    useSchema(schema),
    useLogger(),
    useTiming(),
    useResponseCache({
      enabled: (context) => enableCache(context),
      cache,
      ttl: EXPIRE_IN_SECONDS * 1000,
      includeExtensionMetadata: true,
      ttlPerSchemaCoordinate: {
        // cached execution results that select the `Query.hi` field become stale after 10ms
        'Query.hi': 0,
        'Query.fast': EXPIRE_IN_SECONDS * 1000,
        'Query.quick': EXPIRE_IN_SECONDS * 1000,
        'Query.slow': EXPIRE_IN_SECONDS * 1000,
      },
    }),
  ],
  enableInternalTracing: true,
})

/**
 * Extracts and parses body payload from event with base64 encoding check
 *
 */
const parseEventBody = (event) => {
  if (event.isBase64Encoded) {
    return JSON.parse(Buffer.from(event.body || '', 'base64').toString('utf-8'))
  } else {
    return event.body && JSON.parse(event.body)
  }
}

// The function handler is our serverless GraphQL "server"
export const handler: Handler = async (event) => {
  const { parse, validate, contextFactory, execute, schema } = getEnveloped({
    req: event,
  })

  const request = {
    body: parseEventBody(event),
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
