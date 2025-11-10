
import {
  // MoeOnBoardingValidation,
  MAIL_USERNAME,
  hashPassword,
  comparePassword,
} from "../../utils";
import { streamToBuffer} from "../../services/helper";
import Speakeasy from "speakeasy";
import QRCode from "qrcode";
import {
  ValidationError,
  UserInputError,
  ApolloError,
  AuthenticationError,
  SyntaxError,
  ForbiddenError,
} from "apollo-server-express";
import validator from "validator";
const { equals } = validator;




// *Model
import PRODUCT from "../../models/Product";

import { generateToken } from "../../auth/jwt/jwt";
import { info } from "winston";


module.exports = {


  Query: {
    
     // ✅ Get all products
    GetAllProducts: async () => {
      try {
        const products = await PRODUCT.find();
        return products;
      } catch (error) {
        console.error("Error fetching products:", error);
        throw new Error("Failed to get products");
      }
    },
      // ✅ Get single product by Mongo _id
    GetProductById: async (_, { _id }) => {
      try {
        const product = await PRODUCT.findById(_id);
        if (!product) {
          throw new Error("Product not found");
        }
        return product;
      } catch (error) {
        console.error("Error fetching product:", error);
        throw new Error("Failed to get product");
      }
    },



   
  },


  Mutation: {

       // ✅ Create Product
    CreateProduct: async (_, { data }) => {
      try {
   
         const newProduct = await PRODUCT.create({
          name: data.name,
          brand: data.brand,
          sku: data.sku,
          barcode: data.barcode,
          description: data.description,
          category: data.category,
          subCategory: data.subCategory,
          purchasePrice: data.purchasePrice,
          salePrice: data.salePrice,
          attributes: data.attributes,
          isActive: data.isActive,
          images: data.images,
        });

        return newProduct;
      } catch (error) {
        console.error("Error creating product:", error);
        throw new Error("Failed to create product");
      }
    },

     // ✅ Update Product
    UpdateProduct: async (_, { _id, data }) => {
      try {
    
        const updatedProduct = await PRODUCT.findByIdAndUpdate(
          _id,
          { $set: data },
          { new: true }
        );

        if (!updatedProduct) throw new Error("Product not found");
        return updatedProduct;
      } catch (error) {
        console.error("Error updating product:", error);
        throw new Error("Failed to update product");
      }
    },
  
  },

  Subscription: {
    newMessage: {
      subscribe(parent, args, { pubsub }, info) {
        return pubsub.asyncIterator("MESSAGE");
      },
    },
  },
};
