import warehouseResolvers from "./warehouse.resolvers.js";
import productResolver from "./product.resolver.js";
import purchaseResolver from "./purchase.resolver.js";



const resolvers = {
  Query: {
    ...warehouseResolvers.Query,
    ...productResolver.Query,
    ...purchaseResolver.Query
  },
  Mutation: {
    ...warehouseResolvers.Mutation,
    ...productResolver.Mutation,
    ...purchaseResolver.Mutation

  },
};
export default resolvers
