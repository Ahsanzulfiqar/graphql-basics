import { gql } from 'graphql-tag';

const purchaseTypeDefs = gql `
  type Query {
 GetAllPurchases: [Purchase!]!
 GetPurchaseById(_id: ID!): Purchase
  },

    type Mutation {
          CreatePurchase(data: CreatePurchaseInput!): Purchase!
           ReceivePurchase(purchaseId: ID!): Purchase!
  },

  type Subscription {
  newMessage: String!
  }


type PurchaseItem {
  product: String!        # or Product! if you want to populate later
  variant: String
  productName: String
  sku: String
  variantName: String
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
