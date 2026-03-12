import { ApolloClient, ApolloLink, Cache, HttpLink, InMemoryCache, NormalizedCacheObject, Operation, NextLink } from '@apollo/client'
import { getOperationName, mergeDeep } from '@apollo/client/utilities'
import { useMemo } from 'react'

const debug = process.env.NODE_ENV === 'development'

// Extends InMemoryCache to log every cache read.
// Apollo calls diff() before deciding whether to go to the network, so
// a HIT here means the response will be served from cache (no network log follows).
// A MISS means the loggingLink below will fire next.
class DebugInMemoryCache extends InMemoryCache {
  override diff<T>(options: Cache.DiffOptions): Cache.DiffResult<T> {
    const result = super.diff<T>(options)
    if (options.query) {
      const opName = getOperationName(options.query) ?? 'anonymous'
      console.debug(`[Apollo Cache] ${result.complete ? '✔ HIT ' : '◌ MISS'} ${opName}`)
    }
    return result
  }
}

// Only fires when a request actually reaches the network (cache miss path).
const loggingLink = new ApolloLink((operation: Operation, forward: NextLink) => {
  if (debug) {
    console.debug(`[Apollo Network] ▶ ${operation.operationName}`, operation.variables)
  }
  return forward(operation).map((result) => {
    if (debug) {
      if (result.errors) {
        console.error(`[Apollo Network] ✖ ${operation.operationName}`, result.errors)
      } else {
        console.debug(`[Apollo Network] ✔ ${operation.operationName}`, result.data)
      }
    }
    return result
  })
})

let apolloClient: ApolloClient<NormalizedCacheObject> | undefined

const createApolloClient = (baseUrl?: string) => {
  const uri = baseUrl ? `${baseUrl}/api/graphql` : '/api/graphql'

  return new ApolloClient({
    ssrMode: typeof window === 'undefined',
    link: ApolloLink.from([loggingLink, new HttpLink({ uri, useGETForQueries: true })]),
    cache: debug ? new DebugInMemoryCache() : new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-first',
        nextFetchPolicy: 'cache-first'
      },
      query: {
        fetchPolicy: 'cache-first'
      }
    }
  })
}

export const initializeApollo = (
  initialState: NormalizedCacheObject | null = null,
  baseUrl?: string
) => {
  const _apolloClient = apolloClient ?? createApolloClient(baseUrl)

  if (initialState) {
    const existingCache = _apolloClient.cache.extract()
    // mergeDeep is required — a shallow spread overwrites ROOT_QUERY entirely,
    // discarding all query results from the previous page.
    _apolloClient.cache.restore(mergeDeep(existingCache, initialState))
  }

  if (typeof window === 'undefined') {
    return _apolloClient
  }

  if (!apolloClient) {
    apolloClient = _apolloClient
  }

  return _apolloClient
}

export const useApollo = (initialState?: NormalizedCacheObject | null) => {
  return useMemo(() => initializeApollo(initialState ?? null), [initialState])
}
