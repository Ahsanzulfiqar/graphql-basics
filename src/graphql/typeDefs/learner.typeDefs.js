import { gql } from 'graphql-tag';

const learnerTypeDefs = gql `
  type Query {
    getUser:String!
  },

    type Mutation {
          LernerOnboarding(data:String) : String
  },

  type Subscription {
  newMessage: String!
  }


type Learner {
    id: ID!
    FirstName:String!
    LastName:String!
    DateOfBirth:String!
    EmiratesID:String!
    Gender:String!
    Department:String!
    CourseTitle:String!
    Email:String!
}

input LernerOnboarding {
    FirstName:String!
    LastName:String!
    DateOfBirth:String!
    EmiratesID:String!
    Gender:String!
    Department:String!
    CourseTitle:String!
    Email:String!
}
`

export default learnerTypeDefs;
