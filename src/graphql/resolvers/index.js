import leanerResolvers from "./learner.resolver";
import moeResolvers from "./moe.resolvers";
module.exports = {
  Query: {
    ...leanerResolvers.Query,
    ...moeResolvers.Query,
  },
  Mutation: {
    ...leanerResolvers.Mutation,
    ...moeResolvers.Mutation,
  },
  Subscription: {
    ...leanerResolvers.Subscription,
    ...moeResolvers.Subscription,
  },

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
