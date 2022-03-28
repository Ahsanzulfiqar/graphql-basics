import * as dotenv from 'dotenv'
dotenv.config()

const NODE_ENV = process.env.NODE_ENV || 'development'
const PORT = process.env.PORT || 5000
const MONGO_URL =  process.env.MONGO_URL
// * Mail Configuration 
const MAIL_USERNAME =  process.env.MAIL_USERNAME ||  "invoicematelite@gmail.com"
const MAIL_PASSWORD =  process.env.MAIL_PASSWORD ||   "Qwerty!@#123"
const MAIL_HOST= process.env.MAIL_HOST ||  "smtp.gmail.com"
const MAIL_PORT= process.env.MAIL_PORT || 465
const MAIL_SECURE = process.env.MAIL_SECURE || true


export  {NODE_ENV, PORT ,MAIL_USERNAME , MAIL_PASSWORD , MAIL_HOST , MAIL_PORT , MAIL_SECURE , MONGO_URL }