
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
import WAREHOUSE from "../../models/warehouse.js";



const warehouseResolvers = {
  Query: {
    GetAllWarehouses: async () => {
      try {
        const warehouses = await WAREHOUSE.find();
        return warehouses;
      } catch (error) {
        console.error("Error fetching warehouses:", error);
        throw new Error("Failed to get warehouses");
      }
    },

    GetWarehouseById: async (_, { _id }) => {
      try {
        const warehouse = await WAREHOUSE.findById(_id);
        if (!warehouse) {
          throw new Error("Warehouse not found");
        }
        return warehouse;
      } catch (error) {
        console.error("Error fetching warehouse:", error);
        throw new Error("Failed to get warehouse");
      }
    },


   
  },
  Mutation: {

   
    CreateWarehouse: async (_, args) => {
  try {
   
      const data = args.data;
      const warehouse = new WAREHOUSE({
          name: data.name,
          contact: data.contact,
          ismain: data.ismain,
          mainId:data.mainId,
          country:data.country,
          city:data.city
        });

        const result = await warehouse.save()
        console.log(result,"result")

    return "Warehouse created successfully";
  } catch (error) {
    console.log("Error CreateWarehouse", error);
    throw error;
  }
},




    UpdateWarehouse: async (_, { _id, data }) => {
      try {
        const warehouse = await WAREHOUSE.findByIdAndUpdate(
          _id,
          { $set: data },
          { new: true }
        );

        if (!warehouse) {
          throw new Error("Warehouse not found");
        }

        return "Warehouse updated successfully";
      } catch (error) {
        console.error("Error updating warehouse:", error);
        throw new Error("Failed to update warehouse");
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
 export default warehouseResolvers 