import { gql } from "graphql-tag";

const purchaseTypeDefs = gql`
  scalar Date

  enum PurchaseStatus {
    draft
    confirmed
    received
    cancelled
  }

  type Query {
    GetAllPurchases: [Purchase!]!
    GetPurchaseById(_id: ID!): Purchase
    FilterPurchases(filter: PurchaseFilterInput, page: Int = 1, limit: Int = 20): PurchasePage!
  }

  type Mutation {
    CreatePurchase(data: CreatePurchaseInput!): Purchase!
    ConfirmPurchase(purchaseId: ID!): Purchase!
    CancelPurchase(purchaseId: ID!, reason: String): Purchase!
    UpdatePurchase(id: ID!, data: UpdatePurchaseInput!): Purchase!
    DeletePurchase(id: ID!): Boolean!

    PostToStock(purchaseId: ID!, items: [PostToStockItemInput!]!, taxAmount: Float = 0): Purchase!

    AddManualStock(data: ManualStockInput!): WarehouseStock!
  }

  type PurchaseItem {
    product: ID!
    productName: String!
    variant: ID
    variantName: String
    sku: String!
    quantity: Int!
    purchasePrice: Float
    lineTotal: Float
    batchNo: String
    expiryDate: Date
  }

  type PurchasePayment {
    status: String!
    paidAmount: Float!
    balanceAmount: Float!
    paidAt: Date
  }

  type Purchase {
    _id: ID!
    supplierName: String!
    invoiceNo: String
    warehouse: ID!
    warehouseName: String
    purchaseDate: Date!
    status: PurchaseStatus!
    items: [PurchaseItem!]!
    subTotal: Float!
    taxAmount: Float!
    totalAmount: Float!
    notes: String
    postedToStock: Boolean!
    payment: PurchasePayment
    createdAt: Date!
    updatedAt: Date!
  }

  input PurchaseItemInput {
    product: ID!
    variant: ID
    quantity: Int!
  }

  input CreatePurchaseInput {
    supplierName: String!
    invoiceNo: String
    warehouseId: ID!
    purchaseDate: Date
    items: [PurchaseItemInput!]!
    notes: String
  }

  input PostToStockItemInput {
    product: ID!
    variant: ID
    purchasePrice: Float!
    batchNo: String
    expiryDate: Date
  }

  input UpdatePurchaseItemInput {
    product: ID!
    variant: ID
    quantity: Int!
  }

  input UpdatePurchaseInput {
    supplierName: String
    invoiceNo: String
    warehouseId: ID
    purchaseDate: Date
    status: PurchaseStatus
    items: [UpdatePurchaseItemInput!]
    notes: String
  }

  input PurchaseFilterInput {
    supplierName: String
    warehouseId: ID
    status: String
    dateFrom: Date
    dateTo: Date
    search: String
  }

  type PurchasePage {
    data: [Purchase!]!
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  input ManualStockInput {
    warehouseId: ID!
    productId: ID!
    variantId: ID
    quantity: Int!
    batchNo: String
    expiryDate: Date
    note: String
  }

  type WarehouseStockBatch {
    batchNo: String
    expiryDate: Date
    quantity: Int!
  }

  type WarehouseStock {
    _id: ID!
    warehouse: ID!
    product: ID!
    variant: ID
    quantity: Int!
    reserved: Int!
    reorderLevel: Int
    batches: [WarehouseStockBatch!]
  }
`;

export default purchaseTypeDefs;