import { ApolloClient, HttpLink, InMemoryCache, NormalizedCacheObject } from '@apollo/client'
import { mergeDeep } from '@apollo/client/utilities'

const debug = process.env.NODE_ENV === 'development'
const SERVER_GRAPHQL_URI = 'http://localhost:3000/api/graphql'

// Server-side singleton Apollo client that persists across SSR requests
// within the same Node.js process. This allows cache sharing between pages
// during server-side rendering, reducing redundant API calls.
const serverApolloClient = new ApolloClient<NormalizedCacheObject>({
  ssrMode: true,
  link: new HttpLink({
    uri: SERVER_GRAPHQL_URI,
    useGETForQueries: true
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: {
      fetchPolicy: 'cache-first'
    }
  }
})

export const getServerApolloClient = (): ApolloClient<NormalizedCacheObject> => {
  if (debug) {
    console.debug('[Apollo SSR] Reusing module-level server-side client')
  }

  return serverApolloClient
}

// Extract and merge cache state for client hydration
export const extractAndMerge = (
  client: ApolloClient<NormalizedCacheObject>,
  newState: NormalizedCacheObject
): NormalizedCacheObject => {
  const existingCache = client.cache.extract()
  return mergeDeep(existingCache, newState)
}
