import warehouseResolvers from "./warehouse.resolvers.js";
import productResolver from "./product.resolver.js";
import purchaseResolver from "./purchase.resolver.js";
import sellerResolver from "./seller.resolver.js";
import saleResolvers  from "./sale.resolver.js";




const resolvers = {
  Query: {
    ...warehouseResolvers.Query,
    ...productResolver.Query,
    ...purchaseResolver.Query,
    ...sellerResolver.Query,
    ...saleResolvers.Query

 
  
  },
  Mutation: {
    ...warehouseResolvers.Mutation,
    ...productResolver.Mutation,
    ...purchaseResolver.Mutation,
    ...sellerResolver.Mutation,
    ...saleResolvers.Mutation,

 
  }
};

export default resolvers
