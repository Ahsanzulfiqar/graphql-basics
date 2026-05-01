import { gql } from "apollo-server-express";

const projectTypeDefs = gql`
type Query {
  GetAllProjects: [Project!]!
  GetProjectById(_id: ID!): Project
  GetAllCouriers: [Courier!]!
  GetCourierById(_id: ID!): Courier
  GetProjectsBySeller(sellerId: ID!): [Project!]!
}

  type Mutation {
    CreateProject(data: CreateProjectInput!): Project!
    UpdateProject(_id: ID!, data: UpdateProjectInput!): Project!
    DeleteProject(_id: ID!): String!

    AssignSellerToProject(projectId: ID!, sellerId: ID): Project!
    SetProjectWarehouses(projectId: ID!, warehouseIds: [ID!]!): Project!

    CreateCourier(data: CreateCourierInput!): Courier!
    UpdateCourier(_id: ID!, data: UpdateCourierInput!): Courier!
    DeleteCourier(_id: ID!): String!
  }

  type Project {
    _id: ID!
    name: String!
    channel: String!
    warehouses: [ID!]!
    seller: ID
    isActive: Boolean!
    createdAt: String
    updatedAt: String
  }

  input CreateProjectInput {
    name: String!
    channel: String!
    warehouseIds: [ID!]!
    sellerId: ID
    isActive: Boolean
  }

  input UpdateProjectInput {
    name: String
    channel: String
    warehouseIds: [ID!]
    sellerId: ID
    isActive: Boolean
  }

  type CourierCharges {
    baseCharge: Float
    codCharge: Float
    returnCharge: Float
  }

  type Courier {
    _id: ID!
    name: String!
    isActive: Boolean!
    charges: CourierCharges!
    createdAt: String
    updatedAt: String
  }

  input CreateCourierInput {
    name: String!
    isActive: Boolean
    charges: CourierChargesInput
  }

  input UpdateCourierInput {
    name: String
    isActive: Boolean
    charges: CourierChargesInput
  }

  input CourierChargesInput {
    baseCharge: Float
    codCharge: Float
    returnCharge: Float
  }
`;

export default projectTypeDefs;