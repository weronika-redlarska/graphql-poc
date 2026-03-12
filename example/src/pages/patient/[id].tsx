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
}: Readonly<{
  patientId: string
  referral: ReferralSummary
  onStateChange?: (referralId: string, state: DocumentsState) => void
}>) {
  const [showDocuments, setShowDocuments] = useState(false)
  const { data, loading, error } = useQuery<ReferralDocumentsData>(REFERRAL_DOCUMENTS_QUERY, {
    variables: { patientId, referralId: referral.id },
    skip: !showDocuments
  })

  // Notify parent of state changes for unified visualization
  useEffect(() => {
    if (onStateChange) {
      onStateChange(referral.id, { showDocuments, data, loading, error })
    }
  }, [showDocuments, data, loading, error, onStateChange, referral.id])

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

export default function PatientDetailPage({ id }: Readonly<PageProps>) {
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
    setDocumentStates((prev) => {
      const current = prev.get(referralId)

      if (
        current?.showDocuments === state.showDocuments &&
        current?.data === state.data &&
        current?.loading === state.loading &&
        current?.error === state.error
      ) {
        return prev
      }

      const next = new Map(prev)
      next.set(referralId, state)
      return next
    })
  }, [])

  // Render the full patient graph and progressively highlight fields as more of it is fetched.
  const queryTree = useMemo(() => {
    let patientStatus: QueryNode['status'] = 'pending'
    if (loading) {
      patientStatus = 'loading'
    } else if (patient) {
      patientStatus = 'loaded'
    }

    const getDocumentCollectionStatus = (documentState?: DocumentsState): QueryNode['status'] => {
      if (documentState?.showDocuments !== true) {
        return 'loaded'
      }

      if (documentState.loading) {
        return 'loading'
      }

      if (documentState.error) {
        return 'error'
      }

      return 'loaded'
    }

    const getDocumentMetadataStatus = (documentState?: DocumentsState): QueryNode['status'] => {
      if (documentState?.showDocuments !== true) {
        return 'pending'
      }

      if (documentState.loading) {
        return 'loading'
      }

      if (documentState.error) {
        return 'error'
      }

      return 'loaded'
    }

    const getMetadataLabel = (
      fieldName: string,
      fallbackType: string,
      value?: string | number | null
    ): string => {
      if (value === undefined) {
        return `${fieldName}: ${fallbackType}`
      }

      if (value === null) {
        return `${fieldName}: null`
      }

      if (typeof value === 'number') {
        return `${fieldName}: ${value}`
      }

      return `${fieldName}: "${value}"`
    }

    const patientNode: QueryNode = {
      id: 'patient',
      label: `patient(id: "${id.slice(0, 8)}...")`,
      status: patientStatus,
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
          children: patient?.referrals?.map((referral) => {
            const documentState = documentStates.get(referral.id)
            const detailDocuments = documentState?.data?.referralDocuments ?? []
            const detailDocumentsById = new Map(detailDocuments.map((document) => [document.id, document]))
            const summaryDocumentIds = new Set(referral.documents.map((document) => document.id))
            const mergedDocuments = [
              ...referral.documents.map((document) => detailDocumentsById.get(document.id) ?? document),
              ...detailDocuments.filter((document) => !summaryDocumentIds.has(document.id))
            ]
            const documentsStatus = getDocumentCollectionStatus(documentState)

            return {
              id: `referral-${referral.id}`,
              label: `Referral { title: "${referral.title}" }`,
              status: 'loaded' as const,
              children: [
                { id: `${referral.id}-id`, label: `id: "${referral.id}"`, status: 'loaded' as const },
                { id: `${referral.id}-title`, label: `title: "${referral.title}"`, status: 'loaded' as const },
                { id: `${referral.id}-status`, label: `status: "${referral.status}"`, status: 'loaded' as const },
                { id: `${referral.id}-receivedAt`, label: `receivedAt: "${referral.receivedAt}"`, status: 'loaded' as const },
                {
                  id: `${referral.id}-docs`,
                  label: `documents: [Document!]! (${referral.documentCount} items)`,
                  status: documentsStatus,
                  children: mergedDocuments.map((document) => {
                    const detailedDocument = detailDocumentsById.get(document.id)
                    const metadataStatus = getDocumentMetadataStatus(documentState)
                    const documentStatus = documentState?.showDocuments === true ? documentsStatus : 'loaded'

                    return {
                      id: `${referral.id}-document-${document.id}`,
                      label: `Document { id: "${document.id}" }`,
                      status: documentStatus,
                      children: [
                        { id: `${document.id}-id`, label: `id: "${document.id}"`, status: 'loaded' as const },
                        { id: `${document.id}-title`, label: `title: "${document.title}"`, status: 'loaded' as const },
                        {
                          id: `${document.id}-type`,
                          label: getMetadataLabel('type', 'String', detailedDocument?.type ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: metadataStatus
                        },
                        {
                          id: `${document.id}-size`,
                          label: getMetadataLabel('sizeKb', 'Int', detailedDocument?.sizeKb),
                          status: metadataStatus
                        },
                        {
                          id: `${document.id}-created`,
                          label: getMetadataLabel('createdAt', 'String', detailedDocument?.createdAt ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: metadataStatus
                        },
                        {
                          id: `${document.id}-uploader`,
                          label: getMetadataLabel('uploadedBy', 'String', detailedDocument?.uploadedBy ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: metadataStatus
                        }
                      ]
                    }
                  })
                }
              ]
            }
          })
        }
      ]
    }

    return [patientNode]
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
                            onStateChange={handleDocumentStateChange}
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
              queryName="Patient Graph"
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

