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
    // getUser: async (parent, args, context, info) => {
    //   const user = "joi";
    //   return user;
    // },
  },
  Mutation: {
    LernerOnboarding: (parent, args, { pubsub, user }, info) => {
      return "Ahsan";
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
