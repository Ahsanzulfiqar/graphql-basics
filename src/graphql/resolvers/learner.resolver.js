import Learner from "../../models/learner";
import {
  ValidationError,
  UserInputError,
  ApolloError,
  AuthenticationError,
  SyntaxError,
} from "apollo-server-express";
import {
  logger,
  userRegistrationValidator,
  transporter,
  MAIL_USERNAME,
} from "../../utils";
import { OnBoarding_Mail } from "../../services/helper";

module.exports = {
  Query: {
    getUser: async (parent, args, context, info) => {
      const user = "joi";
      return user;
    },
  },
  Mutation: {
    LernerOnboarding: async (parent, args, { pubsub }, info) => {
      try {
        // * if validation Error return Error
        // const isValidationErrors = await userRegistrationValidator(args)
        // if (!isValidationErrors.valid) {
        //   throw new ValidationError(JSON.stringify(isValidationErrors.errors))
        // }

        const learner = new Learner({
          ...args.data,
        });
        const savedLearner = await learner.save();
        //  * Send OnBoarding Request on Mail
        let mail_Params = {
          from: MAIL_USERNAME,
          to: savedLearner.Email,
          subject: "On Boarding Request",
        };
        await OnBoarding_Mail(mail_Params);
        // publishing subscription
        pubsub.publish("MESSAGE", {
          newMessage: name,
        });
        return savedLearner;
      } catch (error) {
        console.error(new Error(error));
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
