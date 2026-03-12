import { gql } from '@apollo/client'

export const PATIENT_DETAIL_QUERY = gql`
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

export const REFERRAL_DOCUMENTS_QUERY = gql`
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

export type DocumentSummary = {
  id: string
  title: string
}

export type DocumentMeta = DocumentSummary & {
  type?: string
  sizeKb?: number
  createdAt?: string
  uploadedBy?: string
}

export type ReferralSummary = {
  id: string
  title: string
  status: string
  receivedAt: string
  documentCount: number
  documents: DocumentSummary[]
}

export type PatientDetail = {
  id: string
  name: string
  nhsNumber?: string
  dateOfBirth?: string
  gpPractice?: string
  referrals: ReferralSummary[]
}
