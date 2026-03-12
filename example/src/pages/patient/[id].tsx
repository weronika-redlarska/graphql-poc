import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { useQuery, useFragment, gql } from '@apollo/client'
import { useMemo, useState, useCallback, useEffect } from 'react'
import { getServerApolloClient } from '../../lib/serverApolloClient'
import { PATIENT_DETAIL_QUERY, PatientDetail, REFERRAL_DOCUMENTS_QUERY, DocumentMeta, ReferralSummary } from '../../lib/patientQueries'
import { QueryVisualizer, QueryNode } from '../../components/QueryVisualizer'

// Shared fragment for immediate cache reads
const PATIENT_CORE_FRAGMENT = gql`
  fragment PatientCore on Patient {
    id
    name
  }
`

type PageProps = {
  id: string
}

type ReferralDocumentsData = {
  referralDocuments: DocumentMeta[]
}

type DocumentsState = {
  showDocuments: boolean
  data: ReferralDocumentsData | undefined
  loading: boolean
  error: any
}

function ReferralDocumentsSection({
  patientId,
  referral,
  onStateChange
}: {
  patientId: string
  referral: ReferralSummary
  onStateChange?: (state: DocumentsState) => void
}) {
  const [showDocuments, setShowDocuments] = useState(false)
  const { data, loading, error } = useQuery<ReferralDocumentsData>(REFERRAL_DOCUMENTS_QUERY, {
    variables: { patientId, referralId: referral.id },
    skip: !showDocuments
  })

  // Notify parent of state changes for unified visualization
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ showDocuments, data, loading, error })
    }
  }, [showDocuments, data, loading, error, onStateChange])

  const documentList = data?.referralDocuments ?? referral.documents

  return (
    <div className="nhsuk-u-margin-top-4">
      <div className="nhsuk-body nhsuk-u-font-weight-bold">Documents: {referral.documentCount}</div>
      <ul className="nhsuk-list nhsuk-list--bullet">
        {documentList.map((document) => (
          <li key={document.id}>{document.title}</li>
        ))}
      </ul>

      {!showDocuments && (
        <button
          type="button"
          className="nhsuk-button nhsuk-button--secondary"
          onClick={() => setShowDocuments(true)}
        >
          Load document metadata
        </button>
      )}

      {showDocuments && (
        <div className="nhsuk-u-margin-top-3">
          {loading && <p className="nhsuk-body">Loading document metadata...</p>}
          {error && <p className="nhsuk-body">Unable to load document metadata.</p>}

          {!loading && !error && (data?.referralDocuments.length ?? 0) > 0 && (
            <div>
              <p className="nhsuk-body nhsuk-u-font-weight-bold">Document Metadata:</p>
              <ul className="nhsuk-list nhsuk-list--border">
                {data?.referralDocuments.map((document) => (
                  <li key={document.id}>
                    <strong>{document.title}</strong>
                    <div className="nhsuk-hint">Type: {document.type ?? 'Unknown'}</div>
                    <div className="nhsuk-hint">
                      Size: {document.sizeKb ? `${document.sizeKb} KB` : 'Unknown'}
                    </div>
                    <div className="nhsuk-hint">Created: {document.createdAt ?? 'Unknown'}</div>
                    <div className="nhsuk-hint">Uploaded by: {document.uploadedBy ?? 'Unknown'}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PatientDetailPage({ id }: PageProps) {
  const { data: coreData, complete: coreComplete } = useFragment<{ id: string; name: string }>({
    fragment: PATIENT_CORE_FRAGMENT,
    from: { __typename: 'Patient', id }
  })

  const { data, loading } = useQuery<{ patient: PatientDetail | null }>(PATIENT_DETAIL_QUERY, {
    variables: { id },
    fetchPolicy: 'cache-first'
  })

  const patient = data?.patient
  const patientName = patient?.name ?? (coreComplete ? coreData.name : undefined)

  // Track document states for unified visualization
  const [documentStates, setDocumentStates] = useState<Map<string, DocumentsState>>(new Map())

  const handleDocumentStateChange = useCallback((referralId: string, state: DocumentsState) => {
    setDocumentStates(prev => {
      const next = new Map(prev)
      next.set(referralId, state)
      return next
    })
  }, [])

  // Build unified query tree visualization including all progressive loads
  const queryTree = useMemo(() => {
    const patientNode: QueryNode = {
      id: 'patient',
      label: `patient(id: "${id.slice(0, 8)}...")`,
      status: loading ? 'loading' : patient ? 'loaded' : 'pending',
      children: [
        {
          id: 'id',
          label: 'id: ID!',
          status: coreComplete || patient ? 'cached' : 'pending'
        },
        {
          id: 'name',
          label: `name: "${patientName || '...'}"`,
          status: coreComplete || patient ? 'cached' : 'pending'
        },
        {
          id: 'nhsNumber',
          label: `nhsNumber: "${patient?.nhsNumber || '...'}"`,
          status: patient ? 'loaded' : 'pending'
        },
        {
          id: 'dateOfBirth',
          label: `dateOfBirth: "${patient?.dateOfBirth || '...'}"`,
          status: patient ? 'loaded' : 'pending'
        },
        {
          id: 'gpPractice',
          label: `gpPractice: "${patient?.gpPractice || '...'}"`,
          status: patient ? 'loaded' : 'pending'
        },
        {
          id: 'referrals',
          label: `referrals: [Referral!]! (${patient?.referrals?.length || 0} items)`,
          status: patient ? 'loaded' : 'pending',
          children: patient?.referrals?.map((referral) => ({
            id: `referral-${referral.id}`,
            label: `Referral { title: "${referral.title}" }`,
            status: 'loaded' as const,
            children: [
              { id: `${referral.id}-status`, label: `status: "${referral.status}"`, status: 'loaded' as const },
              { id: `${referral.id}-docs`, label: `documents: [Document!]! (${referral.documentCount} items)`, status: 'loaded' as const }
            ]
          }))
        }
      ]
    }

    // Add document query nodes for referrals that have loaded documents
    const documentQueryNodes: QueryNode[] = []
    documentStates.forEach((state, referralId) => {
      if (state.showDocuments) {
        const referral = patient?.referrals.find(r => r.id === referralId)
        if (referral) {
          const documentNode: QueryNode = {
            id: `referralDocuments-${referralId}`,
            label: `referralDocuments(patientId: "${id.slice(0, 8)}...", referralId: "${referralId.slice(0, 8)}...")`,
            status: state.loading ? 'loading' : state.error ? 'error' : state.data ? 'loaded' : 'pending',
            children: state.data?.referralDocuments.map((doc) => ({
              id: `doc-${doc.id}`,
              label: `Document { title: "${doc.title}" }`,
              status: 'loaded' as const,
              children: [
                { id: `${doc.id}-title`, label: `title: "${doc.title}"`, status: 'loaded' as const },
                { id: `${doc.id}-type`, label: `type: "${doc.type ?? 'Unknown'}"`, status: doc.type ? 'loaded' as const : 'pending' },
                { id: `${doc.id}-size`, label: `sizeKb: ${doc.sizeKb ?? 'null'}`, status: doc.sizeKb ? 'loaded' as const : 'pending' },
                { id: `${doc.id}-created`, label: `createdAt: "${doc.createdAt ?? 'Unknown'}"`, status: doc.createdAt ? 'loaded' as const : 'pending' },
                { id: `${doc.id}-uploader`, label: `uploadedBy: "${doc.uploadedBy ?? 'Unknown'}"`, status: doc.uploadedBy ? 'loaded' as const : 'pending' }
              ]
            })) ?? []
          }
          documentQueryNodes.push(documentNode)
        }
      }
    })

    return [patientNode, ...documentQueryNodes]
  }, [patient, loading, coreComplete, patientName, id, documentStates])

  return (
    <>
      <Head>
        <title>Patient detail</title>
        <meta name="description" content="GraphQL SSR patient detail" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="nhsuk-width-container">
        <Link className="nhsuk-back-link" href="/">
          Back to summaries
        </Link>
        <header className="nhsuk-u-margin-bottom-6">
          <h1 className="nhsuk-heading-l">Patient detail</h1>
          <p className="nhsuk-body">Progressively loading patient data from GraphQL with intelligent caching.</p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 450px', gap: '32px', alignItems: 'start' }}>
          <div>
            {loading && !patientName && <p className="nhsuk-body">Loading patient detail…</p>}
            {!loading && !patient && <p className="nhsuk-body">Patient not found.</p>}

            {(patient || patientName) && (
              <section className="nhsuk-u-margin-bottom-6">
                <h2 className="nhsuk-heading-m">{patientName}</h2>
                {patient && (
                  <>
                    <dl className="nhsuk-summary-list">
                      <div className="nhsuk-summary-list__row">
                        <dt className="nhsuk-summary-list__key">NHS number</dt>
                        <dd className="nhsuk-summary-list__value">{patient.nhsNumber ?? 'Not recorded'}</dd>
                      </div>
                      <div className="nhsuk-summary-list__row">
                        <dt className="nhsuk-summary-list__key">Date of birth</dt>
                        <dd className="nhsuk-summary-list__value">{patient.dateOfBirth ?? 'Not recorded'}</dd>
                      </div>
                      <div className="nhsuk-summary-list__row">
                        <dt className="nhsuk-summary-list__key">GP practice</dt>
                        <dd className="nhsuk-summary-list__value">{patient.gpPractice ?? 'Not recorded'}</dd>
                      </div>
                    </dl>

                    <h3 className="nhsuk-heading-s nhsuk-u-margin-top-6">Referrals</h3>
                    {patient.referrals.length === 0 && (
                      <p className="nhsuk-body">No referrals recorded.</p>
                    )}
                    <ul className="nhsuk-list nhsuk-list--border">
                      {patient.referrals.map((referral) => (
                        <li key={referral.id}>
                          <strong>{referral.title}</strong>
                          <div className="nhsuk-hint">Status: {referral.status}</div>
                          <div className="nhsuk-hint">Received: {referral.receivedAt}</div>
                          <ReferralDocumentsSection
                            patientId={patient.id}
                            referral={referral}
                            onStateChange={(state) => handleDocumentStateChange(referral.id, state)}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>

          <div>
            <QueryVisualizer
              queryName="GraphQL Queries"
              tree={queryTree}
              isLoading={loading || Array.from(documentStates.values()).some(state => state.loading)}
              fromCache={coreComplete && !loading}
            />
          </div>
        </div>

        <style jsx>{`
          @media (max-width: 1280px) {
            div[style*="display: grid"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ params }) => {
  const id = params?.id as string
  const serverClient = getServerApolloClient()

  await serverClient.query({
    query: PATIENT_DETAIL_QUERY,
    variables: { id }
  })

  return {
    props: {
      id,
      initialApolloState: serverClient.cache.extract()
    }
  }
}

