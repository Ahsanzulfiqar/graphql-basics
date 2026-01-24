import * as dotenv from "dotenv";
dotenv.config();

 const dbName = 'noora_inventory';


// const uri = `mongodb+srv://${username}:${password}@nooraerp.ror8ksw.mongodb.net/${dbName}?retryWrites=true&w=majority`;


const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 4000;
const Mongo_URI = `mongodb+srv://ahsanzulfiqar:Ahsan123@nooraerp.ror8ksw.mongodb.net/${dbName}?retryWrites=true&w=majority`;
const MONGO_URL = process.env.MONGO_URL || Mongo_URI

// "mongodb+srv://ahsanzulfiqar:Ahsan123@nooraerp.ror8ksw.mongodb.net/";
// mongodb+srv://ahsanzulfiqar:<db.password>@nooraerp.ror8ksw.mongodb.net/
// * Mail Configuration
const MAIL_USERNAME = process.env.MAIL_USERNAME || "invoicematelite@gmail.com";
const MAIL_PASSWORD = process.env.MAIL_PASSWORD || "Qwerty!@#123";
const MAIL_HOST = process.env.MAIL_HOST || "smtp.gmail.com";
const MAIL_PORT = process.env.MAIL_PORT || 465;
const MAIL_SECURE = process.env.MAIL_SECURE || true;
const SECRET = process.env.SECRET || "TEAM_GOKU";

export {
  NODE_ENV,
  PORT,
  MAIL_USERNAME,
  MAIL_PASSWORD,
  MAIL_HOST,
  MAIL_PORT,
  MAIL_SECURE,
  MONGO_URL,
  SECRET,
};
