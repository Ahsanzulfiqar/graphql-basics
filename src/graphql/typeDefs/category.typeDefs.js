import { gql } from "graphql-tag";

const categoryTypeDefs = gql`
  scalar Date

  # -------------------------
  # Enums
  # -------------------------
  enum SortOrder {
    asc
    desc
  }

  # -------------------------
  # Types
  # -------------------------
  type Category {
    _id: ID!
    name: String!
    slug: String!
    description: String
    isActive: Boolean!
    isDeleted: Boolean!
    deletedAt: Date
    createdAt: Date!
    updatedAt: Date!
  }

  type SubCategory {
    _id: ID!
    category: ID!
    categoryName: String
    name: String!
    slug: String!
    description: String
    isActive: Boolean!
    isDeleted: Boolean!
    deletedAt: Date
    createdAt: Date!
    updatedAt: Date!
  }

  # -------------------------
  # Inputs
  # -------------------------
  input CreateCategoryInput {
    name: String!
    description: String
    isActive: Boolean = true
  }

  input UpdateCategoryInput {
    name: String
    description: String
    isActive: Boolean
  }

  input CreateSubCategoryInput {
    categoryId: ID!
    name: String!
    description: String
    isActive: Boolean = true
  }

  input UpdateSubCategoryInput {
    categoryId: ID
    name: String
    description: String
    isActive: Boolean
  }

  input CategoryFilterInput {
    search: String
    isActive: Boolean
    includeDeleted: Boolean = false
    sortBy: String = "updatedAt"
    sortOrder: SortOrder = desc
  }

  input SubCategoryFilterInput {
    categoryId: ID
    search: String
    isActive: Boolean
    includeDeleted: Boolean = false
    sortBy: String = "updatedAt"
    sortOrder: SortOrder = desc
  }

  type CategoryPage {
    data: [Category!]!
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  type SubCategoryPage {
    data: [SubCategory!]!
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  # -------------------------
  # Queries
  # -------------------------
  type Query {
    GetCategoryById(id: ID!): Category
    FilterCategories(filter: CategoryFilterInput, page: Int = 1, limit: Int = 20): CategoryPage!

    GetSubCategoryById(id: ID!): SubCategory
    FilterSubCategories(filter: SubCategoryFilterInput, page: Int = 1, limit: Int = 20): SubCategoryPage!
  }

  # -------------------------
  # Mutations
  # -------------------------
  type Mutation {
    CreateCategory(data: CreateCategoryInput!): Category!
    UpdateCategory(id: ID!, data: UpdateCategoryInput!): Category!
    DeleteCategory(id: ID!): Boolean!

    CreateSubCategory(data: CreateSubCategoryInput!): SubCategory!
    UpdateSubCategory(id: ID!, data: UpdateSubCategoryInput!): SubCategory!
    DeleteSubCategory(id: ID!): Boolean!
  }
`;

export default categoryTypeDefs;
