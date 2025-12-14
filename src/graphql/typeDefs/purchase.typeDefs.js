import { gql } from 'graphql-tag';

const purchaseTypeDefs = gql `
  type Query {
 GetAllPurchases: [Purchase!]!
 GetPurchaseById(_id: ID!): Purchase
FilterPurchases(filter: PurchaseFilterInput, page: Int = 1, limit: Int = 20): PurchasePage!
  },

    type Mutation {
          CreatePurchase(data: CreatePurchaseInput!): Purchase!
           ReceivePurchase(purchaseId: ID!): Purchase!
            UpdatePurchase(id: ID!, data: UpdatePurchaseInput!): Purchase!
  },

  type Subscription {
  newMessage: String!
  }
  


scalar Date

"Line item for each product in a purchase"
type PurchaseItem {
  product: ID!
  productName: String!
  variant: ID!
  variantName: String!
  sku: String!
  quantity: Int!
  purchasePrice: Float!
  lineTotal: Float!
  batchNo: String
  expiryDate: Date
}

"Main Purchase document"
type Purchase {
  _id: ID!
  supplierName: String!
  invoiceNo: String
  warehouse: ID!          # warehouse ObjectId
  purchaseDate: Date!
  status: String!
  items: [PurchaseItem!]!
  subTotal: Float!
  taxAmount: Float!
  totalAmount: Float!
  notes: String
  postedToStock: Boolean!
  createdAt: Date!
  updatedAt: Date!
}

"Input for each line item when creating a purchase (no lineTotal: we calculate it)"
input PurchaseItemInput {
  product: ID!
  productName: String!
  variant: ID!
  variantName: String!
  sku: String!
  quantity: Int!
  purchasePrice: Float!
  batchNo: String
  expiryDate: Date
}

"Input for CreatePurchase mutation"
input CreatePurchaseInput {
  supplierName: String!
  invoiceNo: String
  warehouseId: ID!
  purchaseDate: Date
  items: [PurchaseItemInput!]!
  taxAmount: Float = 0
  notes: String
}

"Filters for getting purchases"
input PurchaseFilterInput {
  supplierName: String
  warehouseId: ID
  status: String
  dateFrom: Date
  dateTo: Date
  search: String  # e.g. invoiceNo, SKU, notes
}

"Paginated result for purchases"
type PurchasePage {
  data: [Purchase!]!
  total: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
}

"Input for updating a purchase"
input UpdatePurchaseItemInput {
  product: ID!
  productName: String!
  variant: ID!
  variantName: String!
  sku: String!
  quantity: Int!
  purchasePrice: Float!
  batchNo: String
  expiryDate: Date
}

input UpdatePurchaseInput {
  supplierName: String
  invoiceNo: String
  warehouseId: ID
  purchaseDate: Date
  status: String
  items: [UpdatePurchaseItemInput!]
  taxAmount: Float
  notes: String
  postedToStock: Boolean
}


`

export default purchaseTypeDefs;
