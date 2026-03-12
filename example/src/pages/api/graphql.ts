import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import type { NextApiRequest } from 'next'
import { gql } from 'graphql-tag'
import { getBaseUrl } from '../../lib/getBaseUrl'
import responseCachePlugin from '@apollo/server-plugin-response-cache';

const typeDefs = gql`
  type Document {
    id: ID!
    title: String!
    type: String
    sizeKb: Int
    createdAt: String
    uploadedBy: String
  }

  type Referral {
    id: ID!
    title: String!
    status: String!
    receivedAt: String!
    documentCount: Int!
    documents: [Document!]!
  }

  type Patient {
    id: ID!
    name: String!
    nhsNumber: String
    dateOfBirth: String
    gpPractice: String
    referrals: [Referral!]!
  }

  type Query {
    patients: [Patient!]!
    patient(id: ID!): Patient
    referralDocuments(patientId: ID!, referralId: ID!): [Document!]!
  }
`

const resolvers = {
  Query: {
    patients: async (_parent: unknown, _args: unknown, context: { baseUrl: string }) => {
      const response = await fetch(`${context.baseUrl}/api/mock/Patient`)
      const bundle = await response.json()

      const buildPatientName = (resource: any) => {
        const name = resource.name?.[0]
        if (!name) {
          return 'Unknown'
        }

        const parts = [
          ...(name.prefix ?? []),
          ...(name.given ?? []),
          ...(name.family ? [name.family] : [])
        ].filter(Boolean)

        return parts.length > 0 ? parts.join(' ') : name.text ?? 'Unknown'
      }
      const resolveOrganizationName = async (reference?: string) => {
        if (!reference || !reference.startsWith('Organization/')) {
          return undefined
        }

        const id = reference.replace('Organization/', '')
        const orgResponse = await fetch(`${context.baseUrl}/api/mock/Organization/${id}`)
        if (!orgResponse.ok) {
          return undefined
        }

        const organization = await orgResponse.json()
        return organization.name as string | undefined
      }

      return Promise.all(
        (bundle.entry ?? []).map(async (entry: any) => {
          const resource = entry.resource
          const gpPractice =
            (await resolveOrganizationName(resource.managingOrganization?.reference)) ??
            resource.managingOrganization?.identifier?.value

          return {
            id: resource.id,
            name: buildPatientName(resource),
            nhsNumber: resource.identifier?.[0]?.value,
            dateOfBirth: resource.birthDate,
            gpPractice: gpPractice ?? 'Unknown',
            referrals: []
          }
        })
      )
    },
    patient: async (
      _parent: unknown,
      args: { id: string },
      context: { baseUrl: string }
    ) => {
      const response = await fetch(`${context.baseUrl}/api/mock/Patient/${args.id}`)
      if (!response.ok) {
        return null
      }
      const patient = await response.json()
      const resolveOrganizationName = async (reference?: string) => {
        if (!reference || !reference.startsWith('Organization/')) {
          return undefined
        }

        const id = reference.replace('Organization/', '')
        const orgResponse = await fetch(`${context.baseUrl}/api/mock/Organization/${id}`)
        if (!orgResponse.ok) {
          return undefined
        }

        const organization = await orgResponse.json()
        return organization.name as string | undefined
      }
      const buildPatientName = (resource: any) => {
        const name = resource.name?.[0]
        if (!name) {
          return 'Unknown'
        }

        const parts = [
          ...(name.prefix ?? []),
          ...(name.given ?? []),
          ...(name.family ? [name.family] : [])
        ].filter(Boolean)

        return parts.length > 0 ? parts.join(' ') : name.text ?? 'Unknown'
      }
      const referralsResponse = await fetch(
        `${context.baseUrl}/api/mock/ServiceRequest?patient=${args.id}`
      )

      const referralsBundle = referralsResponse.ok ? await referralsResponse.json() : { entry: [] }
      const referrals = await Promise.all(
        (referralsBundle.entry ?? []).map(async (entry: any) => {
          const referral = entry.resource
          const documents = (referral.supportingInfo ?? []).map((info: any) => {
            const reference = info.reference as string
            const id = reference?.startsWith('DocumentReference/')
              ? reference.replace('DocumentReference/', '')
              : reference

            return {
              id,
              title: id ?? 'Document'
            }
          })

          return {
            id: referral.id,
            title: referral.code?.text ?? referral.code?.coding?.[0]?.display ?? 'Referral',
            status: referral.status ?? 'unknown',
            receivedAt: referral.authoredOn ?? 'unknown',
            documentCount: documents.length,
            documents
          }
        })
      )

      const gpPractice =
        (await resolveOrganizationName(patient.managingOrganization?.reference)) ??
        patient.managingOrganization?.identifier?.value

      return {
        id: patient.id,
        name: buildPatientName(patient),
        nhsNumber: patient.identifier?.[0]?.value,
        dateOfBirth: patient.birthDate,
        gpPractice: gpPractice ?? 'Unknown',
        referrals
      }
    },
    referralDocuments: async (
      _parent: unknown,
      args: { patientId: string; referralId: string },
      context: { baseUrl: string }
    ) => {
      const serviceRequestResponse = await fetch(
        `${context.baseUrl}/api/mock/ServiceRequest/${args.referralId}`
      )

      if (!serviceRequestResponse.ok) {
        return []
      }

      const serviceRequest = await serviceRequestResponse.json()
      const documentReferences = (serviceRequest.supportingInfo ?? [])
        .map((info: any) => info.reference as string)
        .filter(Boolean)
      const resolveOrganizationName = async (reference?: string) => {
        if (!reference || !reference.startsWith('Organization/')) {
          return undefined
        }

        const id = reference.replace('Organization/', '')
        const orgResponse = await fetch(`${context.baseUrl}/api/mock/Organization/${id}`)
        if (!orgResponse.ok) {
          return undefined
        }

        const organization = await orgResponse.json()
        return organization.name as string | undefined
      }

      return Promise.all(
        documentReferences.map(async (reference: string) => {
          const id = reference.startsWith('DocumentReference/')
            ? reference.replace('DocumentReference/', '')
            : reference

          const documentResponse = await fetch(
            `${context.baseUrl}/api/mock/DocumentReference/${id}`
          )

          if (!documentResponse.ok) {
            return null
          }

          const resource = await documentResponse.json()
          const organizationReference =
            resource.custodian?.reference ?? resource.authenticator?.reference ?? resource.author?.[0]?.reference
          const uploadedBy = await resolveOrganizationName(organizationReference)

          return {
            id: resource.id,
            title: resource.content?.[0]?.attachment?.title ?? 'Document',
            type: resource.content?.[0]?.attachment?.contentType ?? 'Unknown',
            sizeKb: resource.content?.[0]?.attachment?.size,
            createdAt: resource.date,
            uploadedBy
          }
        })
      ).then((documents) => documents.filter(Boolean))
    }
  }
}

type Context = { baseUrl: string }

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
  plugins: [responseCachePlugin({
      sessionId: (requestContext) =>
        requestContext.request.http?.headers.get('session-id') || null,
    })]
})

export default startServerAndCreateNextHandler<NextApiRequest, Context>(server, {
  context: async (req) => ({ baseUrl: getBaseUrl(req) })
})

export const config = {
  api: {
    bodyParser: false
  }
}
