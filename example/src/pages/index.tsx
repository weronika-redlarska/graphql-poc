import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { gql, useApolloClient, useQuery, type NormalizedCacheObject } from '@apollo/client'
import { getServerApolloClient } from '../lib/serverApolloClient'
import { QueryVisualizer, QueryNode } from '../components/QueryVisualizer'
import { useEffect, useMemo, useState } from 'react'
import { getPersistedCacheSnapshot, subscribeToPersistedCacheUpdates } from '../lib/apolloClient'

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

const getPersistedEntity = (
  persistedCache: NormalizedCacheObject | null,
  cacheId?: string
): Record<string, unknown> | undefined => {
  if (!persistedCache || !cacheId) {
    return undefined
  }

  const entity = persistedCache[cacheId]
  return entity && typeof entity === 'object' ? (entity as Record<string, unknown>) : undefined
}

const mapQueryTree = (
  tree: QueryNode[],
  transformStatus: (status: QueryNode['status']) => QueryNode['status']
): QueryNode[] => tree.map((node) => ({
  ...node,
  status: transformStatus(node.status),
  children: node.children ? mapQueryTree(node.children, transformStatus) : undefined
}))

export default function Home() {
  const apolloClient = useApolloClient()
  const { data, loading } = useQuery<{ patients: PatientSummary[] }>(PATIENTS_QUERY)
  const [persistedCache, setPersistedCache] = useState<NormalizedCacheObject | null>(null)

  useEffect(() => {
    const syncPersistedCache = () => {
      setPersistedCache(getPersistedCacheSnapshot())
    }

    syncPersistedCache()

    return subscribeToPersistedCacheUpdates(syncPersistedCache)
  }, [])

  const queryTree = useMemo(() => {
    let patientsStatus: QueryNode['status'] = 'pending'
    if (loading) {
      patientsStatus = 'loading'
    } else if (data) {
      patientsStatus = 'loaded'
    }

    const patientsNode: QueryNode = {
      id: 'patients',
      label: 'patients: [Patient!]!',
      status: patientsStatus,
      children: data?.patients?.slice(0, 3).map((patient) => {
        const patientEntity = getPersistedEntity(
          persistedCache,
          apolloClient.cache.identify({ __typename: 'Patient', id: patient.id }) ?? undefined
        )
        const patientNameStatus: QueryNode['status'] = Object.hasOwn(patientEntity ?? {}, 'name')
          ? 'cached'
          : 'loaded'

        return {
          id: `patient-${patient.id}`,
          label: 'Patient',
          status: 'pending' as const,
          children: [
            { id: `${patient.id}-id`, label: 'id: ID!', status: 'pending' as const },
            { id: `${patient.id}-name`, label: `name: "${patient.name}"`, status: patientNameStatus },
            { id: `${patient.id}-nhsNumber`, label: 'nhsNumber: String', status: 'pending' as const },
            { id: `${patient.id}-dateOfBirth`, label: 'dateOfBirth: String', status: 'pending' as const },
            { id: `${patient.id}-gpPractice`, label: 'gpPractice: String', status: 'pending' as const },
            {
              id: `${patient.id}-referrals`,
              label: 'referrals: [Referral!]!',
              status: 'pending' as const,
              children: [
                {
                  id: `${patient.id}-referral-shape`,
                  label: 'Referral',
                  status: 'pending' as const,
                  children: [
                    { id: `${patient.id}-referral-id`, label: 'id: ID!', status: 'pending' as const },
                    { id: `${patient.id}-referral-title`, label: 'title: String!', status: 'pending' as const },
                    { id: `${patient.id}-referral-status`, label: 'status: String!', status: 'pending' as const },
                    { id: `${patient.id}-referral-receivedAt`, label: 'receivedAt: String!', status: 'pending' as const },
                    { id: `${patient.id}-referral-documentCount`, label: 'documentCount: Int!', status: 'pending' as const },
                    {
                      id: `${patient.id}-referral-documents`,
                      label: 'documents: [Document!]!',
                      status: 'pending' as const,
                      children: [
                        {
                          id: `${patient.id}-document-shape`,
                          label: 'Document',
                          status: 'pending' as const,
                          children: [
                            { id: `${patient.id}-document-id`, label: 'id: ID!', status: 'pending' as const },
                            { id: `${patient.id}-document-title`, label: 'title: String!', status: 'pending' as const },
                            { id: `${patient.id}-document-type`, label: 'type: String', status: 'pending' as const },
                            { id: `${patient.id}-document-sizeKb`, label: 'sizeKb: Int', status: 'pending' as const },
                            { id: `${patient.id}-document-createdAt`, label: 'createdAt: String', status: 'pending' as const },
                            { id: `${patient.id}-document-uploadedBy`, label: 'uploadedBy: String', status: 'pending' as const }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      })
    }

    if (data?.patients && data.patients.length > 3) {
      patientsNode.children?.push({
        id: 'more',
        label: `... and ${data.patients.length - 3} more patients`,
        status: 'loaded' as const
      })
    }

    return [patientsNode]
  }, [apolloClient.cache, data, loading, persistedCache])

  const persistedRootQuery = getPersistedEntity(persistedCache, 'ROOT_QUERY')
  const hasPersistedPatients = Object.hasOwn(persistedRootQuery ?? {}, 'patients')
  const displayTree = useMemo(
    () => mapQueryTree(queryTree, (status) => (status === 'cached' ? 'loaded' : status)),
    [queryTree]
  )
  const cacheTree = useMemo(
    () => mapQueryTree(queryTree, (status) => (status === 'cached' ? 'cached' : 'pending')),
    [queryTree]
  )

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

          <div className="visualizer-rail">
            <QueryVisualizer
              queryName="Patients"
              tree={displayTree}
              isLoading={loading}
              fromCache={false}
              bodyMaxHeight="28vh"
            />
            <QueryVisualizer
              queryName="Persisted Cache"
              tree={cacheTree}
              isLoading={false}
              fromCache={hasPersistedPatients}
              bodyMaxHeight="28vh"
            />
          </div>
        </div>

        <style jsx>{`
          .visualizer-rail {
            position: fixed;
            top: 20px;
            right: 24px;
            width: min(420px, calc(100vw - 48px));
            display: flex;
            flex-direction: column;
            gap: 16px;
            max-height: calc(100vh - 40px);
            z-index: 10;
          }

          @media (max-width: 1024px) {
            div[style*="display: grid"] {
              grid-template-columns: 1fr !important;
            }

            .visualizer-rail {
              position: static;
              top: auto;
              right: auto;
              width: 100%;
              max-height: none;
              margin-top: 24px;
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
