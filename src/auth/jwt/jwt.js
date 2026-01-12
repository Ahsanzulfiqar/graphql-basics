import jwt from "jsonwebtoken";

import { SECRET } from ".././../utils/config.js";
import {
  ValidationError,
  UserInputError,
  ApolloError,
  AuthenticationError,
  SyntaxError,
  ForbiddenError,
} from "apollo-server-express";

// ? Token Types
// * accessToken
// * refreshToken
// * emailToken
// * resetPassword

const common = {
  accessToken: { secret: SECRET, signOptions: { expiresIn: "7d" } },
  refreshToken: { secret: SECRET, signOptions: { expiresIn: "1d" } },
  emailToken: { secret: SECRET, signOptions: { expiresIn: "1h" } },
  resetPassword: { secret: SECRET, signOptions: { expiresIn: "1h" } }
};


export const generateToken = (type, payload) => {
  const cfg = common[type];

  if (!cfg) {
    throw new Error(
      `Invalid token type "${type}". Use one of: ${Object.keys(common).join(", ")}`
    );
  }

  return jwt.sign({ ...payload, type }, cfg.secret, cfg.signOptions);
};

 export const verifyToken = async (token) => {

  const data = await jwt.verify(token, SECRET, async (err, data) => {
    if (err) {
      console.log(err, "verifyToken Error");
      throw new AuthenticationError(
        "Authentication token is invalid, please try again."
      );
    }
    return data;
  });

  return data;
};

