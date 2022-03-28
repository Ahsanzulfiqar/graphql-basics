import mailer from "nodemailer"
import {MAIL_USERNAME , MAIL_PASSWORD ,MAIL_HOST , MAIL_PORT ,  MAIL_SECURE  } from  "./config"

var mailConfig = {
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_SECURE,
  auth: {
    user: MAIL_USERNAME,
    pass: MAIL_PASSWORD
  }
};

let transporter = mailer.createTransport(mailConfig);

module.exports = {transporter}