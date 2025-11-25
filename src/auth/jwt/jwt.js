import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;
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
  accessToken: {
    secret: SECRET,
    signOptions: {
      expiresIn: "7d",
    },
  },
  refreshToken: {
    secret: SECRET,
    signOptions: {
      expiresIn: "1d",
    },
  },
  emailToken: {
    secret: SECRET,
    signOptions: {
      expiresIn: "1h",
    },
  },
  resetPassword: {
    secret: SECRET,
    signOptions: {
      expiresIn: "1h",
    },
  },
};

const generateToken = async (type, user, loginUser) => {
  return await sign(
    {
      user: user,
      currentLogin: loginUser,
      type: type,
    },
    common[type].secret,
    {
      expiresIn: common[type].signOptions.expiresIn, // 15m
    }
  );
};

const verifyToken = async (token) => {
  const data = await verify(token, SECRET, async (err, data) => {
    if (err) {
      console.log(err, "verifyToken Error");
      throw new AuthenticationError(
        "Authentication token is invalid, please try again."
      );
    }
    return data;
  });

  if (data.type === "emailToken") {
    return data.user;
  }
  if (data.user && !data.user.isVerified) {
    throw new ForbiddenError("Please verify your email.");
  }
  return data.user;
};
export { generateToken, verifyToken };
