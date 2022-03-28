
import leanerResolvers from "./learner.resolver"
module.exports = {
  Query: {
    ...leanerResolvers.Query,
  },
  Mutation: {
    ...leanerResolvers.Mutation,
  },
  Subscription : {
    ...leanerResolvers.Subscription
  }
  




















//   Subscription: {
//     ...messageResolvers.Subscription,
//     ...userResolvers.Subscription
//   },
//   Message: {
//     createdAt: (parent) => parent.createdAt.toISOString(),
//   },
//   Group: {
//     createdAt: (parent) => parent.createdAt.toISOString(),
//   },
};
