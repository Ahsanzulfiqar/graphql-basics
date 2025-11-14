import warehouseResolvers from "./warehouse.resolvers";
import issuerResolvers from "./issuer.resolver";
import learnerResolver from "./learner.resolver";
import productResolver from "./product.resolver";
import purchaseResolver from "./purchase.resolver";



module.exports = {
  Query: {
    ...warehouseResolvers.Query,
    ...issuerResolvers.Query,
    ...learnerResolver.Query,
    ...productResolver.Query,
    ...purchaseResolver.Query
  },
  Mutation: {
    ...warehouseResolvers.Mutation,
    ...issuerResolvers.Mutation,
    ...learnerResolver.Mutation,
    ...productResolver.Mutation,
    ...purchaseResolver.Mutation

  },

   PurchaseItem: {
    ...purchaseResolver.PurchaseItem,
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
