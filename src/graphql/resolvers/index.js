import warehouseResolvers from "./warehouse.resolvers";
import issuerResolvers from "./issuer.resolver";
import learnerResolver from "./learner.resolver";
import productResolver from "./product.resolver";

module.exports = {
  Query: {
    ...warehouseResolvers.Query,
    ...issuerResolvers.Query,
    ...learnerResolver.Query,
    ...productResolver.Query,
  },
  Mutation: {
    ...warehouseResolvers.Mutation,
    ...issuerResolvers.Mutation,
    ...learnerResolver.Mutation,
    ...productResolver.Mutation,
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
