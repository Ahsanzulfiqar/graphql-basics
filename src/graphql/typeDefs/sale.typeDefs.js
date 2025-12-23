import { gql } from 'graphql-tag';

const saleTypeDefs = gql `


 type Query {
  FilterSales(filter: SaleFilterInput, page: Int = 1, limit: Int = 20): SalePage!
  GetSaleById(id: ID!): Sale!
  GetSalesSummaryBySeller(sellerId: ID, dateFrom: Date, dateTo: Date): [SellerSalesSummary!]!
}


 type Mutation {
  CreateSale(data: CreateSaleInput!): Sale!
  ReserveSaleStock(saleId: ID!): Sale!
  ShipSale(saleId: ID!): Sale!
  CancelSale(saleId: ID!): Boolean!
  DeleteSale(id: ID!): Boolean!
}

  type Subscription {
  newMessage: String!
  }

scalar Date

type SaleItem {
  product: ID!
  variant: ID
  productName: String!
  variantName: String
  sku: String
  quantity: Float!
  salePrice: Float!
  lineTotal: Float!
}

type Sale {
  _id: ID!
  seller: ID!
  warehouse: ID!
  invoiceNo: String
  customerName: String
  customerPhone: String
  address: String
  status: String!
  items: [SaleItem!]!
  subTotal: Float!
  taxAmount: Float!
  totalAmount: Float!
  notes: String
  createdAt: Date!
  updatedAt: Date!
}

input SaleItemInput {
  productId: ID!
  variantId: ID
  productName: String!
  variantName: String
  sku: String
  quantity: Float!
  salePrice: Float!
}

input CreateSaleInput {
  sellerId: ID!
  warehouseId: ID!
  invoiceNo: String
  customerName: String
  customerPhone: String
  address: String
  items: [SaleItemInput!]!
  taxAmount: Float
  notes: String
}

input SaleFilterInput {
  sellerId: ID
  warehouseId: ID
  status: String
  dateFrom: Date
  dateTo: Date
  search: String
}

type SalePage {
  data: [Sale!]!
  total: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
}



type SellerSalesSummary {
  seller: ID!
  totalSales: Float!
  totalOrders: Int!
}

`

export default saleTypeDefs;
