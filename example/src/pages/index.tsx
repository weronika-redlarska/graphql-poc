import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { gql } from '@apollo/client'
import { getServerApolloClient } from '../lib/serverApolloClient'

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

type PageProps = Readonly<{
  patients: PatientSummary[]
}>

export default function Home({ patients }: PageProps) {

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
          <ul className="nhsuk-list nhsuk-list--border">
            {patients.map((patient) => (
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

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const serverClient = getServerApolloClient()

  const { data } = await serverClient.query<{ patients: PatientSummary[] }>({
    query: PATIENTS_QUERY
  })

  return {
    props: {
      patients: data.patients
    }
  }
}
