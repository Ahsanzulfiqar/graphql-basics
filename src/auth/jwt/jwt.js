import { sign, verify } from "jsonwebtoken";
import { SECRET } from ".././../utils";
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
    secret: process.env.SECRET,
    signOptions: {
      expiresIn: "7d",
    },
  },
  refreshToken: {
    secret: process.env.SECRET,
    signOptions: {
      expiresIn: "1d",
    },
  },
  emailToken: {
    secret: process.env.SECRET,
    signOptions: {
      expiresIn: "1h",
    },
  },
  resetPassword: {
    secret: process.env.SECRET,
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
