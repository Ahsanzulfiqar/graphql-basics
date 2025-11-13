import { gql } from 'graphql-tag';



const issuerTypeDefs = gql `

    type Query {
     GetIssuerDetail: Issuer!
     GetCoursesByIssuer:[Course]!
    },

    type Mutation {
    IssuerOnBoarding(data: IssuerOnBoarding) : String!
    ActivateIssuer(otp:String!) : String!
    SetIssuerPassword (password:String!,confirmPassword:String!) : String!
    IssuerLogin (email:String!, password:String!) : login!
    AddCourse(data:AddCourse) : Course!
    UpdateCourseStatus(courseId:ID!,active:Boolean!) : Course
    },
    
    type Subscription {
  newMessage: String!

    },

    # Issuer type  
    type Issuer {
        id: ID!
        # moeId:ID!
        type:String!
        name: String!,
        adminEmail: String!,
        contactEmail: String,
        telephone: String!,
        address: address,
        siteUrl: String!,
        logoUrl: String,
        # signature:signature,
        publicKey: String,
        approved: Boolean,
        approvalDate: String,
        description: String!,
        revocationList:[String],
        affiliatedInstitutes:affiliatedInstitutes
        isVerified:Boolean,
        createdAt:String!,
        updatedAt:String!,
    }

    # input payload for IssuerOnBoarding mutation
    input IssuerOnBoarding {
        type:String!,
        name: String!,
        adminEmail: String!,
        telephone: String!,
        siteUrl:String!,
        description:String!,
    }
    # address type 
    type address {
        country:String,
        city:String,
        street:String,
    }


    #affiliatedInstitutes type
    type affiliatedInstitutes {
    name:String,
    logoUrl:String,
    active:Boolean
    }

 # login Type
  type login {
    Issuer: Issuer!
    token: String!  
  }

  ### Course ###
    type Course {
      id:ID!,
      issuerId:ID!,
      courseTitle:String!,
      session:String!,
      creditHours:String!,
      code:String,
      description:String,
      active:Boolean!
      createdAt:String!,
      updatedAt:String
    }
    # input payload for AddCourse 
    input AddCourse {
         courseTitle:String!
         session:String!
         creditHours:String!
         code:String!
         description:String!
       }
       
`
export default issuerTypeDefs;
