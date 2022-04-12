// * hash, encryption, private & public keys
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { ary } from "lodash";

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const aes = async (data) => {
  try {
    return CryptoJS.AES.encrypt(data, process.env.AES_KEY).toString();
  } catch (error) {
    console.log("ENCRYPTION ERROR => ", error);
    return error;
  }
};

const unAes = async (data) => {
  try {
    const decrypted = CryptoJS.AES.decrypt(data, process.env.AES_KEY);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.log("DECRYPTION ERROR => ", error);
    return error;
  }
};

export { hashPassword, comparePassword, aes, unAes };
