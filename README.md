# Cache GraphQL Responses in Netlify Serverless Function using a Redis-based Cache

### Setup

- Install netlify cli
- yarn
- Setup Redis
- Set Redis envar for connection string
- netlify init
- netlify build
- netlify dev

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
- quick - 5 seconds delay, returns current time
- slow - 9 seconds delay, returns current timex

### Invalidation

Currently, ttl for all cached is 10secs.

TODO invalidate key and or on mutation
