import mongoose from "mongoose";
import { MONGO_URL } from "./config.js";

const connectToDB = async () => {
  try {
    mongoose.set("strictQuery", true);

    await mongoose.connect(MONGO_URL);

    console.log("Connected to MongoDB");
    return "Connected to MongoDB";
  } catch (error) {
    console.error("Error while connected to MongoDB:", error);
    throw error;
  }
};

export { connectToDB };