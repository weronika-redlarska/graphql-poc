import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { gql, useLazyQuery, useQuery, useFragment } from '@apollo/client'
import { useEffect, useState } from 'react'
import { initializeApollo } from '../../lib/apolloClient'
import { getServerApolloClient } from '../../lib/serverApolloClient'
import { getBaseUrl } from '../../lib/getBaseUrl'

// Shared fragment — the list page writes Patient:id { id, name } into the
// normalised entity cache. useFragment reads from there directly, so the
// patient name is available before PATIENT_DETAIL_QUERY resolves.
const PATIENT_CORE_FRAGMENT = gql`
  fragment PatientCore on Patient {
    id
    name
  }
`

const PATIENT_DETAIL_QUERY = gql`
  query PatientDetail($id: ID!) {
    patient(id: $id) {
      id
      name
      nhsNumber
      dateOfBirth
      gpPractice
      referrals {
        id
        title
        status
        receivedAt
        documentCount
        documents {
          id
          title
        }
      }
    }
  }
`

const REFERRAL_DOCUMENTS_QUERY = gql`
  query ReferralDocuments($patientId: ID!, $referralId: ID!) {
    referralDocuments(patientId: $patientId, referralId: $referralId) {
      id
      title
      type
      sizeKb
      createdAt
      uploadedBy
    }
  }
`

type DocumentSummary = {
  id: string
  title: string
}

type DocumentMeta = DocumentSummary & {
  type?: string
  sizeKb?: number
  createdAt?: string
  uploadedBy?: string
}

type ReferralSummary = {
  id: string
  title: string
  status: string
  receivedAt: string
  documentCount: number
  documents: DocumentSummary[]
}

type PatientDetail = {
  id: string
  name: string
  nhsNumber?: string
  dateOfBirth?: string
  gpPractice?: string
  referrals: ReferralSummary[]
}

type PageProps = {
  id: string
}

export default function PatientDetailPage({ id }: PageProps) {
  // Read the name we already have from the list-page entity cache immediately,
  // before PATIENT_DETAIL_QUERY has a chance to resolve.
  const { data: coreData, complete: coreComplete } = useFragment<{ id: string; name: string }>({
    fragment: PATIENT_CORE_FRAGMENT,
    from: { __typename: 'Patient', id }
  })

  // cache-first: SSR already fetched fresh data into initialApolloState, so the
  // client should trust the cache. cache-and-network would fire a redundant
  // background network call on every page load after SSR.
  const { data, loading } = useQuery<{ patient: PatientDetail | null }>(PATIENT_DETAIL_QUERY, {
    variables: { id },
    fetchPolicy: 'cache-first'
  })
  const [expandedReferralId, setExpandedReferralId] = useState<string | null>(null)
  const [documentCache, setDocumentCache] = useState<Record<string, DocumentMeta[]>>({})
  const [loadDocuments, { data: documentsData, loading: documentsLoading }] = useLazyQuery<{
    referralDocuments: DocumentMeta[]
  }>(REFERRAL_DOCUMENTS_QUERY)

  const patient = data?.patient
  // Fall back to the fragment name so the heading renders on first navigation
  // even while the full query is still in flight.
  const patientName = patient?.name ?? (coreComplete ? coreData.name : undefined)

  useEffect(() => {
    if (expandedReferralId && documentsData?.referralDocuments) {
      setDocumentCache((previous) => ({
        ...previous,
        [expandedReferralId]: documentsData.referralDocuments
      }))
    }
  }, [documentsData, expandedReferralId])

  const handleToggleDocuments = (referralId: string) => {
    const isExpanded = expandedReferralId === referralId

    if (isExpanded) {
      setExpandedReferralId(null)
      return
    }

    setExpandedReferralId(referralId)

    if (!documentCache[referralId]) {
      loadDocuments({ variables: { patientId: id, referralId } })
    }
  }

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
          <p className="nhsuk-body">This view requests additional attributes to enrich the graph on navigation.</p>
        </header>

        {loading && !patientName && <p className="nhsuk-body">Loading patient detail…</p>}
        {!loading && !patient && <p className="nhsuk-body">Patient not found.</p>}

        {(patient || patientName) && (
          <section className="nhsuk-u-margin-bottom-6">
            {/* patientName comes from the fragment cache immediately on client navigation */}
            <h2 className="nhsuk-heading-m">{patientName}</h2>
            {/* Demographics and referrals are only available once the full query resolves */}
            {patient && (<>
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
              {patient.referrals.map((referral) => {
                const isExpanded = expandedReferralId === referral.id
                const documentMeta = documentCache[referral.id]

                return (
                  <li key={referral.id}>
                    <strong>{referral.title}</strong>
                    <div className="nhsuk-hint">Status: {referral.status}</div>
                    <div className="nhsuk-hint">Received: {referral.receivedAt}</div>
                    <div className="nhsuk-body">Documents: {referral.documentCount}</div>
                    <ul className="nhsuk-list nhsuk-list--bullet">
                      {referral.documents.map((document) => (
                        <li key={document.id}>{document.title}</li>
                      ))}
                    </ul>
                    <button
                      className="nhsuk-button nhsuk-button--secondary"
                      type="button"
                      onClick={() => handleToggleDocuments(referral.id)}
                    >
                      {isExpanded ? 'Hide document metadata' : 'Show document metadata'}
                    </button>
                    {isExpanded && (
                      <div className="nhsuk-u-margin-top-4">
                        {documentsLoading && !documentMeta && (
                          <p className="nhsuk-body">Loading document metadata…</p>
                        )}
                        {documentMeta && (
                          <ul className="nhsuk-list nhsuk-list--bullet">
                            {documentMeta.map((document) => (
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
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            </>)}
          </section>
        )}
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, params }) => {
  const id = params?.id as string
  // Use persistent server-side Apollo client that shares cache across SSR requests
  const serverClient = getServerApolloClient(getBaseUrl(req))

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
