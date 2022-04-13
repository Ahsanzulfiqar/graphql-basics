import {
  MoeOnBoardingValidation,
  MAIL_USERNAME,
  hashPassword,
  comparePassword,
} from "../../utils";
import { OnBoarding_Mail } from "../../services/helper";
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
import MOE from "../../models/Moe";

import { generateToken } from "../../auth/jwt/jwt";
import { info } from "winston";

module.exports = {
  Query: {
    //   getUser: async (parent, args, context, info) => {
    //     const user = "joi";
    //     return user;
    //   },
  },
  Mutation: {
    MoeOnBoarding: async (parent, args, { pubsub }, info) => {
      try {
        const params = args.data;
        let secret;
        let qrCode;
        // * if validation Error return Error
        const isValidationErrors = await MoeOnBoardingValidation(params);
        if (!isValidationErrors.valid) {
          console.log(isValidationErrors.errors);
          return new ValidationError(JSON.stringify(isValidationErrors.errors));
        }

        //  Generating QR code
        secret = Speakeasy.generateSecret({ length: 20 });
        await QRCode.toDataURL(secret.otpauth_url)
          .then((url) => {
            qrCode = url;
          })
          .catch((err) => {
            console.log(err.message < "Creating QRcode");
          });

        // * Saved to db
        const moe = new MOE({
          name: params.name,
          adminEmail: params.adminEmail,
          telephone: params.telephone,
          contactEmail: params.contactEmail,
          siteUrl: params.siteUrl,
          qrCode: qrCode,
          secret: secret,
        });

        const savedMoe = await moe.save();
        const jwtToken = await generateToken("emailToken", savedMoe, "MOE");
        if (savedMoe) {
          // * Sending verification mail
          let mail_Params = {
            from: MAIL_USERNAME,
            to: savedMoe.adminEmail,
            subject: "Verification Mail",
            redirectUrl: "",
          };
          await OnBoarding_Mail(mail_Params);
          //  * return Response
          return "Please check your Email for verification";
        }
      } catch (error) {
        console.log("Catch Error", error);
        throw new Error(error);
      }
    },

    ActivateMOE: async (parent, args, { pubsub, user }, info) => {
      try {
        const isMOE = await MOE.findById(user._id);
        if (!isMOE) return new UserInputError("Record not found");

        var verified = Speakeasy.totp.verify({
          secret: isMOE.secret.base32,
          encoding: "base32",
          token: args.opt,
        });

        if (!verified) throw new UserInputError("Invalid OTP.");
        isMOE.isVerified = true;
        await isMOE.save();

        let data = {
          _id: isMOE._id,
          name: isMOE.name,
          adminEmail: isMOE.adminEmail,
          telephone: isMOE.telephone,
          contactEmail: isMOE.contactEmail,
          siteUrl: isMOE.siteUrl,
          isVerified: isMOE.isVerified,
          createdAt: isMOE.createdAt,
          updatedAt: isMOE.updatedAt,
        };

        // * Generating Access Token
        const jwtToken = await generateToken("accessToken", data, "MOE");
        return jwtToken;
      } catch (error) {
        console.log(error, "error");
        throw new UserInputError(error);
      }
    },

    SetMoePassword: async (parent, args, { pubsub, user }, info) => {
      try {
        let { password, confirmPassword } = args;

        const isMOE = await MOE.findById(user._id);
        if (!isMOE) throw new UserInputError("Record not Found");

        if (!equals(password, confirmPassword)) {
          throw new UserInputError("Password not matched");
        }

        isMOE.password = await hashPassword(password);
        await isMOE.save();

        return "Password saved successfully";
      } catch (error) {
        console.log(error, "Catch Error");
        throw new UserInputError(error);
      }
    },

    MOELogin: async (parent, args, { pubsub, user }, info) => {
      try {
        let { email, password } = args;
        const isMOE = await MOE.findOne({ adminEmail: { $eq: email } });
        if (!isMOE) throw new UserInputError("Email not found.");

        let isMatched = await comparePassword(password, isMOE.password);
        if (!isMatched) throw new UserInputError("Invalid email or password.");

        let Moe = {
          _id: isMOE._id,
          name: isMOE.name,
          adminEmail: isMOE.adminEmail,
          telephone: isMOE.telephone,
          contactEmail: isMOE.contactEmail,
          publicKey: isMOE.publicKey,
          signature: isMOE.signature,
          logoImageUrl: isMOE.logoImageUrl,
          siteUrl: isMOE.siteUrl,
          isVerified: isMOE.isVerified,
          createdAt: isMOE.createdAt,
          updatedAt: isMOE.updatedAt,
        };
        const jwtToken = await generateToken("accessToken", Moe, "MOE");
        return { Moe: isMOE, token: jwtToken };
      } catch (error) {
        console.log(error, "Catch Error");
        throw new UserInputError(error);
      }
    },
  },

  Subscription: {
    //   newMessage: {
    //     subscribe(parent, args, { pubsub }, info) {
    //       return pubsub.asyncIterator("MESSAGE");
    //     },
    //   },
  },
};
