import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, NormalizedCacheObject } from '@apollo/client'
import { mergeDeep } from '@apollo/client/utilities'

const debug = process.env.NODE_ENV === 'development'

// Server-side singleton Apollo client that persists across SSR requests
// within the same Node.js process. This allows cache sharing between pages
// during server-side rendering, reducing redundant API calls.
let serverApolloClient: ApolloClient<NormalizedCacheObject> | undefined

export const getServerApolloClient = (baseUrl: string): ApolloClient<NormalizedCacheObject> => {
  if (serverApolloClient) {
    if (debug) {
      console.debug('[Apollo SSR] Reusing existing server-side client')
    }
    return serverApolloClient
  }

  if (debug) {
    console.debug('[Apollo SSR] Creating new server-side client')
  }

  const uri = `${baseUrl}/api/graphql`

  serverApolloClient = new ApolloClient({
    ssrMode: true,
    link: new HttpLink({
      uri,
      useGETForQueries: true
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'cache-first'
      }
    }
  })

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
