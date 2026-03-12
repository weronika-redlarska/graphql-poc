import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { gql, useQuery } from '@apollo/client'
import { getServerApolloClient } from '../lib/serverApolloClient'
import { QueryVisualizer, QueryNode } from '../components/QueryVisualizer'
import { useMemo } from 'react'
import { initializeApollo } from '../lib/apolloClient'

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

  const queryTree = useMemo(() => {
    const patientsNode: QueryNode = {
      id: 'patients',
      label: 'patients: [Patient!]!',
      status: loading ? 'loading' : data ? 'loaded' : 'pending',
      children: data?.patients?.slice(0, 3).map((patient) => ({
        id: `patient-${patient.id}`,
        label: `Patient { id: "${patient.id.slice(0, 8)}...", name: "${patient.name}" }`,
        status: 'loaded' as const,
        children: [
          { id: `${patient.id}-id`, label: 'id: ID!', status: 'loaded' as const },
          { id: `${patient.id}-name`, label: 'name: String!', status: 'loaded' as const }
        ]
      }))
    }

    if (data?.patients && data.patients.length > 3) {
      patientsNode.children?.push({
        id: 'more',
        label: `... and ${data.patients.length - 3} more patients`,
        status: 'loaded' as const
      })
    }

    return [patientsNode]
  }, [data, loading])

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px', alignItems: 'start' }}>
          <div>
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
          </div>

          <div>
            <QueryVisualizer
              queryName="Patients"
              tree={queryTree}
              isLoading={loading}
              fromCache={!loading && !!data}
            />
          </div>
        </div>

        <style jsx>{`
          @media (max-width: 1024px) {
            div[style*="display: grid"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async () => {
  const serverClient = getServerApolloClient()

  await serverClient.query({
    query: PATIENTS_QUERY
  })

  return {
    props: {
      initialApolloState: serverClient.cache.extract()
    }
  }
}
