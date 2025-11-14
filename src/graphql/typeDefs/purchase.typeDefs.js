import { gql } from 'graphql-tag';

const purchaseTypeDefs = gql `
  type Query {
 GetAllPurchases: [Purchase!]!
  GetPurchaseById(_id: ID!): Purchase
  },

    type Mutation {
          CreatePurchase(data: CreatePurchaseInput!): Purchase!
  },

  type Subscription {
  newMessage: String!
  }


type PurchaseItem {
  product: ProductBasic!        # or Product! if you want to populate later
  variant: ProductVariantBasic
  quantity: Int!
  purchasePrice: Float!
  lineTotal: Float!
  batchNo: String
  expiryDate: String
}

type Purchase {
  _id: ID!
  supplierName: String!
  invoiceNo: String
  warehouse: ID!        # or Warehouse!
  purchaseDate: String!
  status: String!
  items: [PurchaseItem!]!
  subTotal: Float!
  taxAmount: Float!
  totalAmount: Float!
  notes: String
  postedToStock: Boolean!
  createdAt: String!
  updatedAt: String!
}

type ProductBasic {
  _id: ID!
  name: String!
  sku: String
}

type ProductVariantBasic {
  _id: ID!
  name: String!
  sku: String
}


input PurchaseItemInput {
  productId: ID!
  variantId: ID
  quantity: Int!
  purchasePrice: Float!
  batchNo: String
  expiryDate: String
}

input CreatePurchaseInput {
  supplierName: String!
  invoiceNo: String
  warehouseId: ID!
  purchaseDate: String
  items: [PurchaseItemInput!]!
  taxAmount: Float
  notes: String
}


`

export default purchaseTypeDefs;
