# Cache GraphQL Responses in Netlify Serverless Function using a Redis-based Cache

### Setup

- Install netlify cli
- yarn
- Setup Redis
- Set Redis envar for connection string
- netlify init
- netlify build
- netlify dev
- netlify dev --edgeHandlers

- yarn serve

### Configuration

EXPIRE_IN_SECONDS defaults to 30 seconds

### Disable Cache

Set `enable-response-cache` request header to `false`

### Use Insomnia

```
> POST /.netlify/functions/graphql HTTP/1.1
> Host: localhost:8888
> User-Agent: insomnia/2021.5.3
> Content-Type: application/json
> Accept: */*
> Content-Length: 27

| {"query":"query { quick }"}
```

### Queries

- hi - "there"
- fast - no delay, returns current time
- quick - 3.5 seconds delay, returns current time
- slow - 7 seconds delay, returns current timex

### Invalidation

Currently, ttl for all cached is 10secs.

TODO invalidate key and or on mutation

## Benchmarks

```
brew install k6
```

BENCHMARK_GRAPHQL_ENDPOINT
