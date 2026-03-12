import Head from 'next/head'
import Link from 'next/link'
import type { GetServerSideProps } from 'next'
import { getServerApolloClient } from '../../lib/serverApolloClient'
import { PATIENT_DETAIL_QUERY, PatientDetail } from '../../lib/patientQueries'

type PageProps = Readonly<{
  patient: PatientDetail | null
}>

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
                  <ul className="nhsuk-list nhsuk-list--bullet">
                    {referral.documents.map((document) => (
                      <li key={document.id}>{document.title}</li>
                    ))}
                  </ul>
                  <Link
                    className="nhsuk-button nhsuk-button--secondary"
                    href={`/patient/${patient.id}/referrals/${referral.id}/documents`}
                  >
                    View document metadata
                  </Link>
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
      patient: data.patient
    }
  }
}

