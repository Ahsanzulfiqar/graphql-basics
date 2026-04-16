

import { mergeResolvers } from "@graphql-tools/merge";

import warehouseResolvers from "./warehouse.resolvers.js";
import productResolvers from "./product.resolver.js";
import purchaseResolvers from "./purchase.resolver.js";
import sellerResolvers from "./seller.resolver.js";
import saleResolvers from "./sale.resolver.js";
import projectResolvers from "./project.resolver.js";
import userResolvers from "./user.resolver.js";
import categoryResolvers from "./category.resolvers.js";
import dashboardResolver from "./dashboard.resolvers.js";


const resolvers = mergeResolvers([
  warehouseResolvers,
  productResolvers,
  purchaseResolvers,
  sellerResolvers,
  saleResolvers,
  projectResolvers,
  userResolvers,
  categoryResolvers,
  dashboardResolver
]);

export default resolvers;
