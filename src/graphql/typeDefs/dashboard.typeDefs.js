import gql from "graphql-tag";

export default gql`
  type SalesTrendPoint {
    label: String
    amount: Float
  }

  type LowStockItem {
    productId: ID
    productName: String
    variantId: ID
    variantName: String
    sku: String
    warehouseId: ID
    warehouseName: String
    currentQty: Float
    reservedQty: Float
    availableQty: Float
    reorderLevel: Float
    avgCost: Float
  }

  type CountrySalesItem {
    country: String
    orders: Int
    revenue: Float
    receivables: Float
  }

  type AdminDashboardSummary {
    revenue: Float
    netProfit: Float
    stockValue: Float
    purchases: Float
    receivables: Float
    payables: Float
    salesTrend: [SalesTrendPoint]
    lowStockItems: [LowStockItem]
    countrySales: [CountrySalesItem]
  }

  extend type Query {
    AdminDashboard(
      warehouseId: ID
      warehouseIds: [ID]
      from: String
      to: String
    ): AdminDashboardSummary
  }
`;