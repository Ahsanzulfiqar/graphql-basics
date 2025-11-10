import {
  // MoeOnBoardingValidation,
  MAIL_USERNAME,
  hashPassword,
  comparePassword,
  issuerOnBoardingValidation,
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
import WAREHOUSE from "../../models/warehouse";
import ISSUER from "../../models/Issuer";
import COURSE from "../../models/Courses";
import { generateToken } from "../../auth/jwt/jwt";
import { info } from "winston";

module.exports = {
  Query: {
    GetIssuerDetail: async (parent, args, { pubsub, user }, info) => {
      try {
        console.log(user._id);
        const isIssuer = await ISSUER.findById(user._id);
        if (!isIssuer) throw new ApolloError("Record not found");
        return isIssuer;
      } catch (error) {
        console.log(error, "CatchError");
        throw new ApolloError(error);
      }
    },
    GetCoursesByIssuer: async (parent, args, { pubsub, user }, info) => {
      try {
        console.log(user._id);
        const isCourses = await COURSE.find({ issuerId: { $eq: user._id } });
        if (!isCourses) throw new ApolloError("Record not found");
        return isCourses;
      } catch (error) {
        console.log(error, "CatchError");
        throw new ApolloError(error);
      }
    },
  },
  Mutation: {
    IssuerOnBoarding: async (parent, args, { pubsub }, info) => {
      try {
        const params = args.data;
        let secret;
        let qrCode;
        // * if validation Error return Error
        const isValidationErrors = await issuerOnBoardingValidation(params);
        if (!isValidationErrors.valid) {
          console.log(isValidationErrors.errors);
          return new ValidationError(JSON.stringify(isValidationErrors.errors));
        }

        //  Generating QR code
        secret = Speakeasy.generateSecret({ length: 20 });
        await QRCode.toDataURL(secret.otpauth_url)
          .then((url) => {
            qrCode = url;
            console.log(qrCode, "qrCode");
          })
          .catch((err) => {
            console.log(err.message < "Creating QRcode");
          });

        // const moe = await MOE.findOne();

        // * Saved to db
        // const issuer = new ISSUER({
        //   moeId: moe._id,
        //   type: params.type,
        //   name: params.name,
        //   adminEmail: params.adminEmail,
        //   telephone: params.telephone,
        //   description: params.description,
        //   siteUrl: params.siteUrl,
        //   qrCode: qrCode,
        //   secret: secret,
        // });

        const savedIssuer = await issuer.save();

        const jwtToken = await generateToken(
          "emailToken",
          savedIssuer,
          "ISSUER"
        );
        console.log(jwtToken, "Token");
        if (savedIssuer) {
          // * Sending verification mail

          // let mail_Params = {
          //   from: savedIssuer.adminEmail,
          //   to: moe.adminEmail,
          //   subject: "Issuer onBoarding Request",
          //   message: `${savedIssuer.name} Send ON Boarding request in our Platform`,
          //   redirectUrl: "",
          // };
          await OnBoarding_Mail(mail_Params);

          return "Please check your Email for verification";
        }
      } catch (error) {
        console.log("Catch Error", error);
        throw new ApolloError(error);
      }
    },

    ActivateIssuer: async (parent, args, { pubsub, user }, info) => {
      try {
        const isIssuer = await ISSUER.findById(user._id);
        if (!isIssuer) return new UserInputError("Invalid Issuer ID.");

        var verified = Speakeasy.totp.verify({
          secret: isIssuer.secret.base32,
          encoding: "base32",
          token: args.otp,
        });

        if (!verified) throw new UserInputError("Invalid OTP.");
        isIssuer.isVerified = true;
        await isIssuer.save();

        let data = {
          _id: isIssuer._id,
          name: isIssuer.name,
          adminEmail: isIssuer.adminEmail,
          telephone: isIssuer.telephone,
          contactEmail: isIssuer.contactEmail,
          siteUrl: isIssuer.siteUrl,
          isVerified: isIssuer.isVerified,
          createdAt: isIssuer.createdAt,
          updatedAt: isIssuer.updatedAt,
        };

        // * Generating Access Token
        const jwtToken = await generateToken("accessToken", data, "ISSUER");
        console.log(jwtToken, "jwtToken");
        return jwtToken;
      } catch (error) {
        console.log(error, "error");
        throw new UserInputError(error);
      }
    },

    SetIssuerPassword: async (parent, args, { pubsub, user }, info) => {
      try {
        let { password, confirmPassword } = args;

        const isIssuer = await ISSUER.findById(user._id);
        if (!isIssuer) throw new UserInputError("Record not Found");

        if (!equals(password, confirmPassword)) {
          throw new UserInputError("Password not matched");
        }

        isIssuer.password = await hashPassword(password);
        await isIssuer.save();

        return "Password saved successfully";
      } catch (error) {
        console.log(error, "Catch Error");
        throw new UserInputError(error);
      }
    },

    IssuerLogin: async (parent, args, { pubsub, user }, info) => {
      try {
        let { email, password } = args;
        const isIssuer = await ISSUER.findOne({ adminEmail: { $eq: email } });
        if (!isIssuer) throw new UserInputError("Email not found.");

        let isMatched = await comparePassword(password, isIssuer.password);
        if (!isMatched) throw new UserInputError("Invalid email or password.");

        let Issuer = {
          _id: isIssuer._id,
          name: isIssuer.name,
          adminEmail: isIssuer.adminEmail,
          telephone: isIssuer.telephone,
          contactEmail: isIssuer.contactEmail,
          publicKey: isIssuer.publicKey,
          // signature: isIssuer.signature,
          logoImageUrl: isIssuer.logoUrl,
          siteUrl: isIssuer.siteUrl,
          isVerified: isIssuer.isVerified,
          createdAt: isIssuer.createdAt,
          updatedAt: isIssuer.updatedAt,
        };
        const jwtToken = await generateToken("accessToken", Issuer, "ISSUER");
        return { Issuer: Issuer, token: jwtToken };
      } catch (error) {
        console.log(error, "Catch Error");
        throw new UserInputError(error);
      }
    },

    AddCourse: async (parent, args, { pubsub, user }, info) => {
      try {
        const isIssuer = await ISSUER.findById(user._id);
        if (!isIssuer) throw new AuthenticationError("Invalid issuer Id.");

        if (!isIssuer.isVerified)
          throw new AuthenticationError("Please verify your account first.");

        const { courseTitle, session, creditHours, code, description } =
          args.data;

        const course = new COURSE({
          issuerId: user._id,
          courseTitle: courseTitle,
          session: session,
          creditHours: creditHours,
          code: code,
          description: description,
        });
        const savedCourse = await course.save();

        return savedCourse;
      } catch (error) {
        console.log(error, "CatchError");
        throw new ApolloError(error);
      }
    },

    UpdateCourseStatus: async (parent, args, { pubsub, user }, info) => {
      try {
        const { courseId, active } = args;
        const isCourse = await COURSE.findOne({
          _id: { $eq: courseId },
          issuerId: { $eq: user._id },
        });
        if (!isCourse) throw ApolloError("Course not found");
        isCourse.active = active;
        const updatedCourse = await isCourse.save();
        return updatedCourse;
      } catch (error) {
        console.log(error, "CatchError");
        throw new Error(error);
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
