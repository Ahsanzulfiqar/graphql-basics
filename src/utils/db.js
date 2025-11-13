 //  connect  db 

 const mongoose = require("mongoose"); 
 import { MONGO_URL } from "./config";

const connectToDB = async () => {
  try {
    mongoose.set('strictQuery', true);
    mongoose.connect(
      MONGO_URL,
      { useNewUrlParser: true, useUnifiedTopology: true },
      () => {
        console.log("Connected to MongoDB");
        return "Connected to MongoDB" 
      }
    );
  } catch (error) {
    console.log(error, "Error while  connected  to mongodb");
  }
};

export  { connectToDB }