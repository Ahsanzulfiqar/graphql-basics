import { gql } from 'graphql-tag';

const saleTypeDefs = gql `


type Query {
  FilterSales(filter: SaleFilterInput, page: Int = 1, limit: Int = 20): SalePage!
  GetSaleById(id: ID!): Sale!
  GetAllSales(page: Int = 1, limit: Int = 20): SalePage!
  GetSalesSummaryBySeller(sellerId: ID, projectId: ID, dateFrom: Date, dateTo: Date): [SellerSalesSummary!]!
}

type Mutation {
  CreateSale(data: CreateSaleInput!): Sale!
  ConfirmSale(saleId: ID!): Sale!
  MarkOutForDelivery(saleId: ID!, data: OutForDeliveryInput!): Sale!
  MarkDelivered(saleId: ID!): Sale!
  CancelSale(saleId: ID!): Boolean!
  ReturnSale(saleId: ID!): Sale!
  MarkSalePaid(saleId: ID!, payment: PaymentInput!): Sale!
}


scalar Date


  # ✅ Courier breakdown types
  type CourierCharges {
    baseCharge: Float
    codCharge: Float
    returnCharge: Float
  }

  type SaleCourier {
    courierId: ID
    courierName: String
    charges: CourierCharges
    trackingNo: String
    trackingUrl: String
  }

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
  project: ID!
  seller: ID!
  warehouse: ID!
  invoiceNo: String
  customerName: String
  customerPhone: String
  country: String
  city: String
  address: String
  courier: SaleCourier
  deliveryNotes: String
  shippedAt: Date
  status: String!
  items: [SaleItem!]!
  subTotal: Float!
  taxAmount: Float!
  totalAmount: Float!
  statusTimestamps: SaleStatusTimestamps
  statusHistory: [SaleStatusHistory!]!
  createdAt: Date!
  updatedAt: Date!
  payment: PaymentInfo

}


type SalePage {
  data: [Sale!]!
  total: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
}


type SaleStatusTimestamps {
  draftAt: Date
  confirmedAt: Date
  outForDeliveryAt: Date
  deliveredAt: Date
  cancelledAt: Date
  returnedAt: Date
}

type SaleStatusHistory {
  status: String!
  at: Date!
  by: ID
  note: String
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
  projectId: ID!
  sellerId: ID!
  warehouseId: ID!
  invoiceNo: String
  customerName: String
  customerPhone: String
  country: String
  city: String
  address: String
  items: [SaleItemInput!]!
  taxAmount: Float
  notes: String
  payment: PaymentInput
}





 # ✅ Updated OutForDelivery input to use courierId + optional COD logic
  input OutForDeliveryInput {
    courierId: ID!
    trackingNo: String!
    trackingUrl: String
    deliveryNotes: String
    shippedAt: Date
    isCOD: Boolean
  }


input SaleFilterInput {
  projectId: ID
  sellerId: ID
  warehouseId: ID
  status: String
  dateFrom: Date
  dateTo: Date
  search: String
}



type SellerSalesSummary {
  seller: ID!
  totalSales: Float!
  totalOrders: Int!
}

type PaymentInfo {
  status: String!
  mode: String
  bankAccount: String
  paidAmount: Float
  balanceAmount: Float
  paidAt: Date
}

input PaymentInput {
  status: String
  mode: String
  bankAccount: String
  paidAmount: Float
}

`

export default saleTypeDefs;