import { gql } from "graphql-tag";

const accountTypeDefs = gql`
  scalar Date



 type Query {
    GetAccounts(
      search: String
      type: AccountType
      isActive: Boolean
    ): [Account!]!
    GetAccountById(id: ID!): Account!
    GetAccountTree: [Account!]!
  }

  type Mutation {
    SeedDefaultAccounts: [Account!]!
    CreateAccount(data: CreateAccountInput!): Account!
    UpdateAccount(
      id: ID!
      data: UpdateAccountInput!
    ): Account!
    DeleteAccount(id: ID!): Boolean!
    DisableAccount(id: ID!): Account!
    EnableAccount(id: ID!): Account!
  }

  enum AccountType {
    ASSET
    LIABILITY
    INCOME
    EXPENSE
    EQUITY
  }

  type Account {
    _id: ID!
    name: String!
    code: String
    type: AccountType!
    parentId: ID
    isActive: Boolean!
    isDeleted: Boolean
    children: [Account!]
    createdAt: Date
    updatedAt: Date
  }

  input CreateAccountInput {
    name: String!
    code: String
    type: AccountType!
    parentId: ID
    isActive: Boolean
  }

  input UpdateAccountInput {
    name: String
    code: String
    type: AccountType
    parentId: ID
    isActive: Boolean
  }

 
`;

export default accountTypeDefs;