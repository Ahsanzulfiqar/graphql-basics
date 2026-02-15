import * as dotenv from "dotenv";
dotenv.config();

const {
  NODE_ENV = "development",
  PORT = 4000,

  MONGO_USER,
  MONGO_PASS,
  MONGO_HOST,
  MONGO_DB,

  MAIL_USERNAME,
  MAIL_PASSWORD,
  MAIL_HOST,
  MAIL_PORT,
  MAIL_SECURE,

  SECRET,
} = process.env;

const MONGO_URL =
  process.env.MONGO_URL ||
  `mongodb+srv://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(
    MONGO_PASS
  )}@${MONGO_HOST}/${MONGO_DB}?retryWrites=true&w=majority`;

export {
  NODE_ENV,
  PORT,
  MONGO_URL,
  MAIL_USERNAME,
  MAIL_PASSWORD,
  MAIL_HOST,
  MAIL_PORT,
  MAIL_SECURE,
  SECRET,
};
