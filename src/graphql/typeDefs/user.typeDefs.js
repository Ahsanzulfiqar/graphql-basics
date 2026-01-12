import { gql } from 'graphql-tag';

const userTypeDefs = gql `


  type Query {
    Me: User
    GetAllUsers: [User!]!
    GetUserById(_id: ID!): User
  }
   type Mutation {
    Register(data: RegisterInput!): AuthPayload!
    Login(data: LoginInput!): AuthPayload!

    CreateUser(data: CreateUserInput!): User!
    UpdateUser(_id: ID!, data: UpdateUserInput!): User!
    DeactivateUser(_id: ID!): String!

    AssignProjectsToUser(userId: ID!, projectIds: [ID!]!): User!
    AssignWarehousesToUser(userId: ID!, warehouseIds: [ID!]!): User!

    ChangeMyPassword(oldPassword: String!, newPassword: String!): String!
  }


 type User {
    _id: ID!
    name: String!
    email: String!
    phone: String
    role: String!
    assignedProjects: [ID!]
    assignedWarehouses: [ID!]
    isActive: Boolean!
    createdAt: String
    updatedAt: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input RegisterInput {
    name: String!
    email: String!
    phone: String
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreateUserInput {
    name: String!
    email: String!
    phone: String
    password: String!
    role: String!
    projectIds: [ID!]
    warehouseIds: [ID!]
  }

  input UpdateUserInput {
    name: String
    phone: String
    role: String
    projectIds: [ID!]
    warehouseIds: [ID!]
    isActive: Boolean
  }
  



`

export default userTypeDefs;
