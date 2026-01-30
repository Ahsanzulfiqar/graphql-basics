import warehouseResolvers from "./warehouse.resolvers.js";
import productResolver from "./product.resolver.js";
import purchaseResolver from "./purchase.resolver.js";
import sellerResolver from "./seller.resolver.js";
import saleResolvers from "./sale.resolver.js";
import projectResolvers from "./project.resolver.js";
import usereResolvers from "./user.resolver.js";
import categoryResolvers from "./category.resolvers.js";

const resolvers = {
  // ✅ Add this: merge all TYPE resolvers too (Purchase, SubCategory, etc.)
  ...(warehouseResolvers || {}),
  ...(productResolver || {}),
  ...(purchaseResolver || {}),
  ...(sellerResolver || {}),
  ...(saleResolvers || {}),
  ...(projectResolvers || {}),
  ...(usereResolvers || {}),
  ...(categoryResolvers || {}),

  // ✅ Keep your Query merge
  Query: {
    ...(warehouseResolvers.Query || {}),
    ...(productResolver.Query || {}),
    ...(purchaseResolver.Query || {}),
    ...(sellerResolver.Query || {}),
    ...(saleResolvers.Query || {}),
    ...(usereResolvers.Query || {}),
    ...(projectResolvers.Query || {}),
    ...(categoryResolvers.Query || {}),
  },

  // ✅ Keep your Mutation merge
  Mutation: {
    ...(warehouseResolvers.Mutation || {}),
    ...(productResolver.Mutation || {}),
    ...(purchaseResolver.Mutation || {}),
    ...(sellerResolver.Mutation || {}),
    ...(saleResolvers.Mutation || {}),
    ...(projectResolvers.Mutation || {}),
    ...(usereResolvers.Mutation || {}),
    ...(categoryResolvers.Mutation || {}),
  },
};

export default resolvers;
