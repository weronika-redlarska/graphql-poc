import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { getServerApolloClient } from '../../../../../lib/serverApolloClient'
import {
  PATIENT_DETAIL_QUERY,
  PatientDetail,
  REFERRAL_DOCUMENTS_QUERY,
  DocumentMeta
} from '../../../../../lib/patientQueries'

type PageProps = Readonly<{
  patient: PatientDetail | null
  referralId: string
  documents: DocumentMeta[]
}>

export default function ReferralDocumentsPage({ patient, referralId, documents }: PageProps) {
  const referral = patient?.referrals.find((item) => item.id === referralId)

  return (
    <>
      <Head>
        <title>Referral document metadata</title>
        <meta name="description" content="GraphQL SSR referral document metadata" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="nhsuk-width-container">
        <Link className="nhsuk-back-link" href={patient ? `/patient/${patient.id}` : '/'}>
          Back to patient detail
        </Link>

        <header className="nhsuk-u-margin-bottom-6">
          <h1 className="nhsuk-heading-l">Referral document metadata</h1>
          {patient && (
            <p className="nhsuk-body">
              {patient.name}
              {referral ? ` · ${referral.title}` : ''}
            </p>
          )}
        </header>

        {!patient && <p className="nhsuk-body">Patient not found.</p>}
        {patient && !referral && <p className="nhsuk-body">Referral not found.</p>}
        {patient && referral && documents.length === 0 && (
          <p className="nhsuk-body">No document metadata found.</p>
        )}

        {patient && referral && documents.length > 0 && (
          <ul className="nhsuk-list nhsuk-list--border">
            {documents.map((document) => (
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
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ params }) => {
  const id = params?.id as string
  const referralId = params?.referralId as string
  const serverClient = getServerApolloClient()

  const [{ data: patientData }, { data: documentData }] = await Promise.all([
    serverClient.query<{ patient: PatientDetail | null }>({
      query: PATIENT_DETAIL_QUERY,
      variables: { id }
    }),
    serverClient.query<{ referralDocuments: DocumentMeta[] }>({
      query: REFERRAL_DOCUMENTS_QUERY,
      variables: { patientId: id, referralId }
    })
  ])

  return {
    props: {
      patient: patientData.patient,
      referralId,
      documents: documentData.referralDocuments
    }
  }
}
