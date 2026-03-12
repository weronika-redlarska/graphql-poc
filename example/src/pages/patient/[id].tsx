import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { useQuery, useFragment, gql, useApolloClient, type NormalizedCacheObject } from '@apollo/client'
import { useMemo, useState, useCallback, useEffect } from 'react'
import { getServerApolloClient } from '../../lib/serverApolloClient'
import { getPersistedCacheSnapshot, subscribeToPersistedCacheUpdates } from '../../lib/apolloClient'
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

const hasPersistedField = (
  entity: Record<string, unknown> | undefined,
  fieldName: string
): boolean => Object.hasOwn(entity ?? {}, fieldName)

const hasAllPersistedFields = (
  entity: Record<string, unknown> | undefined,
  fieldNames: string[]
): boolean => fieldNames.every((fieldName) => hasPersistedField(entity, fieldName))

const mapQueryTree = (
  tree: QueryNode[],
  transformStatus: (status: QueryNode['status']) => QueryNode['status']
): QueryNode[] => tree.map((node) => ({
  ...node,
  status: transformStatus(node.status),
  children: node.children ? mapQueryTree(node.children, transformStatus) : undefined
}))

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
  const apolloClient = useApolloClient()
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
  const [persistedCache, setPersistedCache] = useState<NormalizedCacheObject | null>(null)

  useEffect(() => {
    const syncPersistedCache = () => {
      setPersistedCache(getPersistedCacheSnapshot())
    }

    syncPersistedCache()

    return subscribeToPersistedCacheUpdates(syncPersistedCache)
  }, [])

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
    const patientEntity = getPersistedEntity(
      persistedCache,
      apolloClient.cache.identify({ __typename: 'Patient', id }) ?? undefined
    )

    const getFieldStatus = (
      entity: Record<string, unknown> | undefined,
      fieldName: string,
      fallbackLoaded: boolean
    ): QueryNode['status'] => {
      if (hasPersistedField(entity, fieldName)) {
        return 'cached'
      }

      return fallbackLoaded ? 'loaded' : 'pending'
    }

    let patientStatus: QueryNode['status'] = 'pending'
    if (loading) {
      patientStatus = 'loading'
    } else if (patient) {
      const hasPersistedPatientSelection = hasAllPersistedFields(patientEntity, [
        'id',
        'name',
        'nhsNumber',
        'dateOfBirth',
        'gpPractice',
        'referrals'
      ])

      patientStatus = hasPersistedPatientSelection ? 'cached' : 'loaded'
    }

    const getDocumentCollectionStatus = (
      documentState: DocumentsState | undefined,
      referralEntity: Record<string, unknown> | undefined
    ): QueryNode['status'] => {
      if (hasPersistedField(referralEntity, 'documents')) {
        return 'cached'
      }

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

    const getDocumentMetadataStatus = (
      documentState: DocumentsState | undefined,
      documentEntity: Record<string, unknown> | undefined,
      fieldName: string
    ): QueryNode['status'] => {
      if (hasPersistedField(documentEntity, fieldName)) {
        return 'cached'
      }

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
          status: getFieldStatus(patientEntity, 'id', coreComplete || !!patient)
        },
        {
          id: 'name',
          label: `name: "${patientName || '...'}"`,
          status: getFieldStatus(patientEntity, 'name', coreComplete || !!patient)
        },
        {
          id: 'nhsNumber',
          label: `nhsNumber: "${patient?.nhsNumber || '...'}"`,
          status: getFieldStatus(patientEntity, 'nhsNumber', !!patient)
        },
        {
          id: 'dateOfBirth',
          label: `dateOfBirth: "${patient?.dateOfBirth || '...'}"`,
          status: getFieldStatus(patientEntity, 'dateOfBirth', !!patient)
        },
        {
          id: 'gpPractice',
          label: `gpPractice: "${patient?.gpPractice || '...'}"`,
          status: getFieldStatus(patientEntity, 'gpPractice', !!patient)
        },
        {
          id: 'referrals',
          label: `referrals: [Referral!]! (${patient?.referrals?.length || 0} items)`,
          status: getFieldStatus(patientEntity, 'referrals', !!patient),
          children: patient?.referrals?.map((referral) => {
            const documentState = documentStates.get(referral.id)
            const referralEntity = getPersistedEntity(
              persistedCache,
              apolloClient.cache.identify({ __typename: 'Referral', id: referral.id }) ?? undefined
            )
            const detailDocuments = documentState?.data?.referralDocuments ?? []
            const detailDocumentsById = new Map(detailDocuments.map((document) => [document.id, document]))
            const summaryDocumentIds = new Set(referral.documents.map((document) => document.id))
            const mergedDocuments = [
              ...referral.documents.map((document) => detailDocumentsById.get(document.id) ?? document),
              ...detailDocuments.filter((document) => !summaryDocumentIds.has(document.id))
            ]
            const documentsStatus = getDocumentCollectionStatus(documentState, referralEntity)
            const referralStatus: QueryNode['status'] = hasAllPersistedFields(referralEntity, [
              'id',
              'title',
              'status',
              'receivedAt',
              'documentCount',
              'documents'
            ])
              ? 'cached'
              : 'loaded'

            return {
              id: `referral-${referral.id}`,
              label: `Referral { title: "${referral.title}" }`,
              status: referralStatus,
              children: [
                { id: `${referral.id}-id`, label: `id: "${referral.id}"`, status: getFieldStatus(referralEntity, 'id', true) },
                { id: `${referral.id}-title`, label: `title: "${referral.title}"`, status: getFieldStatus(referralEntity, 'title', true) },
                { id: `${referral.id}-status`, label: `status: "${referral.status}"`, status: getFieldStatus(referralEntity, 'status', true) },
                { id: `${referral.id}-receivedAt`, label: `receivedAt: "${referral.receivedAt}"`, status: getFieldStatus(referralEntity, 'receivedAt', true) },
                {
                  id: `${referral.id}-docs`,
                  label: `documents: [Document!]! (${referral.documentCount} items)`,
                  status: documentsStatus,
                  children: mergedDocuments.map((document) => {
                    const documentEntity = getPersistedEntity(
                      persistedCache,
                      apolloClient.cache.identify({ __typename: 'Document', id: document.id }) ?? undefined
                    )
                    const detailedDocument = detailDocumentsById.get(document.id)
                    const isDocumentSummaryCached = hasAllPersistedFields(documentEntity, ['id', 'title'])
                    const isDocumentMetadataCached = hasAllPersistedFields(documentEntity, [
                      'type',
                      'sizeKb',
                      'createdAt',
                      'uploadedBy'
                    ])

                    let documentStatus: QueryNode['status'] = 'loaded'
                    if (isDocumentSummaryCached && (!documentState?.showDocuments || isDocumentMetadataCached)) {
                      documentStatus = 'cached'
                    } else if (documentState?.showDocuments === true) {
                      documentStatus = documentsStatus
                    }

                    return {
                      id: `${referral.id}-document-${document.id}`,
                      label: `Document { id: "${document.id}" }`,
                      status: documentStatus,
                      children: [
                        { id: `${document.id}-id`, label: `id: "${document.id}"`, status: getFieldStatus(documentEntity, 'id', true) },
                        { id: `${document.id}-title`, label: `title: "${document.title}"`, status: getFieldStatus(documentEntity, 'title', true) },
                        {
                          id: `${document.id}-type`,
                          label: getMetadataLabel('type', 'String', detailedDocument?.type ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: getDocumentMetadataStatus(documentState, documentEntity, 'type')
                        },
                        {
                          id: `${document.id}-size`,
                          label: getMetadataLabel('sizeKb', 'Int', detailedDocument?.sizeKb),
                          status: getDocumentMetadataStatus(documentState, documentEntity, 'sizeKb')
                        },
                        {
                          id: `${document.id}-created`,
                          label: getMetadataLabel('createdAt', 'String', detailedDocument?.createdAt ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: getDocumentMetadataStatus(documentState, documentEntity, 'createdAt')
                        },
                        {
                          id: `${document.id}-uploader`,
                          label: getMetadataLabel('uploadedBy', 'String', detailedDocument?.uploadedBy ?? (detailedDocument ? 'Unknown' : undefined)),
                          status: getDocumentMetadataStatus(documentState, documentEntity, 'uploadedBy')
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
  }, [apolloClient.cache, coreComplete, documentStates, id, loading, patient, patientName, persistedCache])

  const hasPersistedPatient = hasPersistedField(
    getPersistedEntity(
      persistedCache,
      apolloClient.cache.identify({ __typename: 'Patient', id }) ?? undefined
    ),
    'id'
  )
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

          <div className="visualizer-rail">
            <QueryVisualizer
              queryName="Patient Graph"
              tree={displayTree}
              isLoading={loading || Array.from(documentStates.values()).some(state => state.loading)}
              fromCache={false}
              bodyMaxHeight="28vh"
            />
            <QueryVisualizer
              queryName="Persisted Cache"
              tree={cacheTree}
              isLoading={false}
              fromCache={hasPersistedPatient}
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

          @media (max-width: 1280px) {
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

