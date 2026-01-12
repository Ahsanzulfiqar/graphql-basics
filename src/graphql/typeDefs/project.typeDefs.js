import  {gql} from "apollo-server-express" 



const projectTypeDefs =  gql`

 type Query {
  GetAllProjects: [Project!]!
  GetProjectById(_id: ID!): Project
}

 type Mutation {
  CreateProject(data: CreateProjectInput!): Project!
  UpdateProject(_id: ID!, data: UpdateProjectInput!): Project!
  DeleteProject(_id: ID!): String!

  AssignSellersToProject(projectId: ID!, sellerIds: [ID!]!): Project!
  SetProjectWarehouses(projectId: ID!, warehouseIds: [ID!]!): Project!
}

type Project {
  _id: ID!
  name: String!
  channel: String!
  warehouses: [ID!]!
  sellers: [ID!]
  isActive: Boolean!
  createdAt: String
  updatedAt: String
}

input CreateProjectInput {
  name: String!
  channel: String!
  warehouseIds: [ID!]!
  sellerIds: [ID!]
  isActive: Boolean
}

input UpdateProjectInput {
  name: String
  channel: String
  warehouseIds: [ID!]
  sellerIds: [ID!]
  isActive: Boolean
}

`
export default projectTypeDefs;