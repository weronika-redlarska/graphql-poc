import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, NormalizedCacheObject, Operation, NextLink } from '@apollo/client'
import { mergeDeep } from '@apollo/client/utilities'
import { useMemo } from 'react'
import { LoggingInMemoryCache } from './LoggingInMemoryCache'

const debug = process.env.NODE_ENV === 'development'
const APOLLO_CACHE_STORAGE_KEY = 'apollo-cache'
const APOLLO_CACHE_UPDATED_EVENT = 'apollo-cache-updated'
let persistedCacheSnapshot: NormalizedCacheObject | null = null

const notifyPersistedCacheUpdated = () => {
  if (globalThis.window === undefined) {
    return
  }

  globalThis.window.dispatchEvent(new CustomEvent(APOLLO_CACHE_UPDATED_EVENT))
}

const restoreCacheFromStorage = (cache: InMemoryCache) => {
  if (globalThis.window === undefined) {
    return
  }

  const storedCache = globalThis.localStorage.getItem(APOLLO_CACHE_STORAGE_KEY)

  if (!storedCache) {
    return
  }

  try {
    persistedCacheSnapshot = JSON.parse(storedCache) as NormalizedCacheObject
    cache.restore(persistedCacheSnapshot)
    notifyPersistedCacheUpdated()
  } catch (error) {
    console.warn('[Apollo Cache] Failed to restore persisted cache', error)
    persistedCacheSnapshot = null
    globalThis.localStorage.removeItem(APOLLO_CACHE_STORAGE_KEY)
    notifyPersistedCacheUpdated()
  }
}

const persistCacheToStorage = (cache: InMemoryCache) => {
  if (globalThis.window === undefined) {
    return
  }

  try {
    persistedCacheSnapshot = cache.extract()
    globalThis.localStorage.setItem(APOLLO_CACHE_STORAGE_KEY, JSON.stringify(persistedCacheSnapshot))
    notifyPersistedCacheUpdated()
  } catch (error) {
    console.warn('[Apollo Cache] Failed to persist cache', error)
  }
}

const createCache = () => {
  const cache = debug ? new LoggingInMemoryCache('/api/graphql') : new InMemoryCache()

  restoreCacheFromStorage(cache)

  const originalWrite = cache.write.bind(cache)
  cache.write = (...args) => {
    const result = originalWrite(...args)
    persistCacheToStorage(cache)
    return result
  }

  const originalModify = cache.modify.bind(cache)
  cache.modify = (...args) => {
    const result = originalModify(...args)
    persistCacheToStorage(cache)
    return result
  }

  const originalEvict = cache.evict.bind(cache)
  cache.evict = (...args) => {
    const result = originalEvict(...args)
    persistCacheToStorage(cache)
    return result
  }

  const originalReset = cache.reset.bind(cache)
  cache.reset = async () => {
    const result = await originalReset()
    persistCacheToStorage(cache)
    return result
  }

  return cache
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
    ssrMode: globalThis.window === undefined,
    link: ApolloLink.from([loggingLink, new HttpLink({ uri, useGETForQueries: true })]),
    cache: createCache(),
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

    if (globalThis.window !== undefined) {
      persistCacheToStorage(_apolloClient.cache as InMemoryCache)
    }
  }

  if (globalThis.window === undefined) {
    return _apolloClient
  }

  apolloClient ??= _apolloClient

  return _apolloClient
}

export const useApollo = (initialState?: NormalizedCacheObject | null) => {
  return useMemo(() => initializeApollo(initialState ?? null), [initialState])
}

export const getPersistedCacheSnapshot = (): NormalizedCacheObject | null => persistedCacheSnapshot

export const subscribeToPersistedCacheUpdates = (
  onChange: () => void
): (() => void) => {
  if (globalThis.window === undefined) {
    return () => undefined
  }

  globalThis.window.addEventListener(APOLLO_CACHE_UPDATED_EVENT, onChange)

  return () => {
    globalThis.window.removeEventListener(APOLLO_CACHE_UPDATED_EVENT, onChange)
  }
}
