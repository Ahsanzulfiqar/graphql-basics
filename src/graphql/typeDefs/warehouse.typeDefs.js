import  {gql} from "apollo-server-express" 

const warehouseTypeDefs  = gql`

    type Query {
     GetAllWarehouses: [warehouse!]!
     GetWarehouseById(_id: ID!): warehouse
     GetWarehouseStock(filter: WarehouseStockFilterInput page: Int = 1 limit: Int = 50): WarehouseStockPage!
     GetWarehouseProductBatches(warehouseId: ID!, productId: ID!, variantId: ID): [WarehouseStockBatch!]!

    }


    type Mutation {
    CreateWarehouse(data:CreateWarehouseInput): String!
     UpdateWarehouse(_id: ID!, data: UpdateWarehouseInput!): String!

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

`
export default warehouseTypeDefs;