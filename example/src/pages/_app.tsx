import { ApolloProvider, NormalizedCacheObject } from '@apollo/client'
import type { AppProps } from 'next/app'
import 'nhsuk-frontend/dist/nhsuk.css'
import { useApollo } from '../lib/apolloClient'

type ApolloPageProps = {
  initialApolloState?: NormalizedCacheObject | null
}

export default function App({ Component, pageProps }: AppProps<ApolloPageProps>) {
  const apolloClient = useApollo(pageProps.initialApolloState)

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  )
}
