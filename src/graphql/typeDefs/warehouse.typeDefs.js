import  {gql} from "apollo-server-express" 

const warehouseTypeDefs  = gql`

    type Query {
     GetAllWarehouses: [warehouse!]!
     GetWarehouseById(_id: ID!): warehouse
     GetWarehouseStock(filter: WarehouseStockFilterInput page: Int = 1 limit: Int = 50): WarehouseStockPage!
     GetWarehouseProductBatches(warehouseId: ID!, productId: ID!, variantId: ID): [WarehouseStockBatch!]!
     GetWarehouseStockById(id: ID!): WarehouseStock
     GetStockTransfers: [StockTransfer!]!
    GetStockTransferById(id: ID!): StockTransfer
    }


    type Mutation {
    CreateWarehouse(data:CreateWarehouseInput): String!
    UpdateWarehouse(_id: ID!, data: UpdateWarehouseInput!): String!
    CreateStockTransfer(data: CreateStockTransferInput!): StockTransfer!
    ConfirmStockTransfer(id: ID!): StockTransfer!
    CancelStockTransfer(id: ID!): StockTransfer!
    AddOpeningStockForAllProducts(warehouseId: ID!, quantity: Float!): BulkOpeningStockResponse!
    AddOpeningStock(data: AddOpeningStockInput!): WarehouseStock!
    },






   type warehouse {
    _id: ID!
    name: String!
    contact: String!
    ismain: Boolean!
    mainId: String!
    country:String!
    city:String!
    }

    


    input CreateWarehouseInput{
      name:String!,
      contact:String!,
      ismain:Boolean!,
      mainId:String!,
      city:String!,
      country:String!
    }


input UpdateWarehouseInput {
  name: String
  contact: String
  ismain: Boolean
  mainId: String
  city:String
  country:String
}


type WarehouseStockBatch {
  batchNo: String
  expiryDate: Date
  quantity: Int
  unitCost: Float
}



type WarehouseStock {
  _id: ID!
  warehouse: ID!
  warehouseName: String
  product: ID!
  productName: String
  variant: ID
  variantName: String
  quantity: Int!
  reserved: Int!
  reorderLevel: Int!
  avgCost: Float
  batches: [WarehouseStockBatch!]!
  createdAt: Date!
  updatedAt: Date!
}




input WarehouseStockFilterInput {
  warehouseId: ID
  productId: ID
  variantId: ID
}

type WarehouseStockPage {
  data: [WarehouseStock!]!
  total: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
}


input CreateStockTransferInput {
    fromWarehouse: ID!
    toWarehouse: ID!
    items: [StockTransferItemInput!]!
    note: String
  }

input StockTransferItemInput {
    product: ID!
    variant: ID
    quantity: Int!
    batchNo: String
    expiryDate: Date
  }

  type StockTransfer {
  _id: ID!
  transferNo: String

  fromWarehouse: ID!
  fromWarehouseName: String

  toWarehouse: ID!
  toWarehouseName: String

  items: [StockTransferItem!]!

  status: String!
  note: String
  createdBy: ID
  confirmedBy: ID
  confirmedAt: Date
  createdAt: Date!
  updatedAt: Date!
}

type StockTransferItem {
  product: ID!
  productName: String

  variant: ID
  variantName: String

  quantity: Int!
  batchNo: String
  expiryDate: Date
}


  type StockTransferItem {
    product: ID!
    variant: ID
    quantity: Int!
    batchNo: String
    expiryDate: Date
  }

    type BulkOpeningStockResponse {
    success: Boolean!
    productsUpdated: Int!
  }

input OpeningStockBatchInput {
  batchNo: String
  expiryDate: String
  quantity: Float!
  unitCost: Float!
}

input AddOpeningStockInput {
  warehouseId: ID!
  productId: ID!
  variantId: ID
  batches: [OpeningStockBatchInput!]!
  note: String
}




`
export default warehouseTypeDefs;