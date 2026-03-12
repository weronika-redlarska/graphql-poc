import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { gql, useQuery } from '@apollo/client'
import { initializeApollo } from '../lib/apolloClient'
import { getServerApolloClient } from '../lib/serverApolloClient'
import { getBaseUrl } from '../lib/getBaseUrl'

const PATIENTS_QUERY = gql`
  query Patients {
    patients {
      id
      name
    }
  }
`

type PatientSummary = {
  id: string
  name: string
}

export default function Home() {
  const { data, loading } = useQuery<{ patients: PatientSummary[] }>(PATIENTS_QUERY)

  return (
    <>
      <Head>
        <title>GraphQL SSR PoC</title>
        <meta name="description" content="GraphQL SSR PoC with Apollo" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="nhsuk-width-container">
        <header className="nhsuk-u-margin-bottom-6">
          <h1 className="nhsuk-heading-xl">GraphQL SSR PoC</h1>
          <p className="nhsuk-body">The list below renders on the server using GraphQL and only requests the fields required for this view.</p>
        </header>
        <section className="nhsuk-u-margin-bottom-6">
          <h2 className="nhsuk-heading-m">Patient summaries (SSR)</h2>
          {loading && <p className="nhsuk-body">Loading patient list…</p>}
          <ul className="nhsuk-list nhsuk-list--border">
            {data?.patients?.map((patient) => (
              <li key={patient.id}>
                <Link href={`/patient/${patient.id}`}>{patient.name}</Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="nhsuk-u-margin-bottom-6">
          <h2 className="nhsuk-heading-s">What happens next?</h2>
          <p className="nhsuk-body">Selecting a patient navigates to a detail page that requests additional attributes to enrich the graph.</p>
        </section>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  // Use persistent server-side Apollo client that shares cache across SSR requests
  const serverClient = getServerApolloClient(getBaseUrl(req))

  await serverClient.query({
    query: PATIENTS_QUERY
  })

  return {
    props: {
      initialApolloState: serverClient.cache.extract()
    }
  }
}
