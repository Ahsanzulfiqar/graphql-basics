import hbs from "handlebars";
import path from "path";
import fs from "fs-extra";
import { MAIL_USERNAME, transporter } from "../utils";
const OnBoarding_Mail = (params) => {
  const templatePath = path.join(
    __dirname,
    "../assets/templates/OnBoarding.html"
  );

  fs.readFile(
    templatePath,
    {
      encoding: "utf-8",
    },
    function (error, html) {
      if (error) {
        console.error(
          new Error(error, "Reading html template - OnBoarding_Mail")
        );
        throw err;
      } else {
        var template = hbs.compile(html);
        // * Passing variable in Html template
        // var replacements = {
        //   title: savedNotification.notificationAction,
        //   subject: savedNotification.notificationAction,
        // };
        var htmlToSend = template(params);

        const mailOptions = {
          from: params.MAIL_USERNAME,
          to: params.to,
          subject: params.subject,
          html: htmlToSend,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
            console.log(
              new Error(error, "Sending html template - OnBoarding_Mail")
            );
          } else {
            console.log(info.response + "Email sent -  OnBoarding_Mail");
          }
        });
      }
    }
  );
};

module.exports = {
  OnBoarding_Mail,
};
