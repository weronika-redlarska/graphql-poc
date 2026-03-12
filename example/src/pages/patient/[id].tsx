import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { useQuery, NormalizedCacheObject } from '@apollo/client'
import Link from 'next/link'
import { useState } from 'react'
import { getServerApolloClient } from '../../lib/serverApolloClient'
import {
  PATIENT_DETAIL_QUERY,
  PatientDetail,
  REFERRAL_DOCUMENTS_QUERY,
  DocumentMeta,
  ReferralSummary
} from '../../lib/patientQueries'

type PageProps = Readonly<{
  patient: PatientDetail | null
  initialApolloState: NormalizedCacheObject
}>

type ReferralDocumentsData = {
  referralDocuments: DocumentMeta[]
}

function ReferralDocumentsSection({ patientId, referral }: Readonly<{ patientId: string; referral: ReferralSummary }>) {
  const [showDocuments, setShowDocuments] = useState(false)
  const { data, loading, error } = useQuery<ReferralDocumentsData>(REFERRAL_DOCUMENTS_QUERY, {
    variables: { patientId, referralId: referral.id },
    skip: !showDocuments
  })
  const documentList = data?.referralDocuments ?? referral.documents

  return (
    <section className="nhsuk-u-margin-top-4">
      <ul className="nhsuk-list nhsuk-list--bullet">
        {documentList.map((document) => (
          <li key={document.id}>{document.title}</li>
        ))}
      </ul>

      {!showDocuments && (
        <button
          type="button"
          className="nhsuk-button nhsuk-button--secondary nhsuk-u-margin-bottom-0"
          onClick={() => setShowDocuments(true)}
        >
          Load document metadata
        </button>
      )}

      {showDocuments && loading && <p className="nhsuk-body nhsuk-u-margin-top-3">Loading document metadata...</p>}
      {showDocuments && error && (
        <p className="nhsuk-body nhsuk-u-margin-top-3">Unable to load document metadata.</p>
      )}
      {showDocuments && !loading && !error && data?.referralDocuments.length === 0 && (
        <p className="nhsuk-body nhsuk-u-margin-top-3">No document metadata found.</p>
      )}

      {showDocuments && !loading && !error && (data?.referralDocuments.length ?? 0) > 0 && (
        <ul className="nhsuk-list nhsuk-list--border nhsuk-u-margin-top-3">
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
      )}
    </section>
  )
}

export default function PatientDetailPage({ patient }: PageProps) {
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
          <p className="nhsuk-body">This view is rendered entirely from server-side GraphQL data.</p>
        </header>

        {!patient && <p className="nhsuk-body">Patient not found.</p>}

        {patient && (
          <section className="nhsuk-u-margin-bottom-6">
            <h2 className="nhsuk-heading-m">{patient.name}</h2>
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
                  <div className="nhsuk-body">Documents: {referral.documentCount}</div>
                  <ReferralDocumentsSection patientId={patient.id} referral={referral} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ params }) => {
  const id = params?.id as string
  const serverClient = getServerApolloClient()

  const { data } = await serverClient.query<{ patient: PatientDetail | null }>({
    query: PATIENT_DETAIL_QUERY,
    variables: { id }
  })

  return {
    props: {
      patient: data.patient,
      initialApolloState: serverClient.cache.extract()
    }
  }
}

