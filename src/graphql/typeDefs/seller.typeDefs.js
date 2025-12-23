import { gql } from 'graphql-tag';

const sellerTypeDefs = gql `


 type Query {
  GetSellers(search: String, page: Int = 1, limit: Int = 20): SellerPage!
  GetSellerById(id: ID!): Seller!
}

   type Mutation {
  CreateSeller(data: CreateSellerInput!): Seller!
  UpdateSeller(id: ID!, data: UpdateSellerInput!): Seller!
  DeleteSeller(id: ID!): Boolean!
}

  type Subscription {
  newMessage: String!
  }



scalar Date

type Seller {
  _id: ID!
  name: String!
  email: String
  phone: String
  companyName: String
  address: String
  sellerType: String!
  commissionType: String!
  commissionValue: Float!
  isActive: Boolean!
  createdAt: Date!
  updatedAt: Date!
}

input CreateSellerInput {
  name: String!
  email: String
  phone: String
  companyName: String
  address: String
  sellerType: String
  commissionType: String
  commissionValue: Float
}

input UpdateSellerInput {
  name: String
  email: String
  phone: String
  companyName: String
  address: String
  sellerType: String
  commissionType: String
  commissionValue: Float
  isActive: Boolean
}

type SellerPage {
  data: [Seller!]!
  total: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
}



`

export default sellerTypeDefs;
