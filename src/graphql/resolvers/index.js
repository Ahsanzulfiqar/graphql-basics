import moeResolvers from "./moe.resolvers";
import issuerResolvers from "./issuer.resolver";
import learnerResolver from "./learner.resolver";

module.exports = {
  Query: {
    ...moeResolvers.Query,
    ...issuerResolvers.Query,
    ...learnerResolver.Query,
  },
  Mutation: {
    ...moeResolvers.Mutation,
    ...issuerResolvers.Mutation,
    ...learnerResolver.Mutation,
  },
  Subscription: {
    // ...moeResolvers.Subscription,
    // ...issuerResolvers.Subscription,
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
