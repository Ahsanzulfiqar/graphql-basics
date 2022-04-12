// import  {isEmail , isEmpty, equals, isAlphanumeric, isBoolean, isInt ,isJWT  ,isLength , isLowercase ,isMongoId ,isNumeric, isStrongPassword, trim } from  "validator"
import validator from "validator";

const { isEmpty, isLength, isAlphanumeric, isStrongPassword, isEmail } =
  validator;

const userRegistrationValidator = (params) => {
  const { name, age, email } = params;
  const errors = {};

  // * Name Validation's
  if (!isAlphanumeric(name)) {
    errors.name = "Name must have alphanumeric characters only.";
  }

  if (
    !isLength(name, {
      min: 3,
      max: 20,
    })
  ) {
    errors.name = "Name must be in range of 3-20 characters.";
  }

  // * Email Validation's
  if (!isEmail(email)) {
    errors.email = "Invalid Email";
  }
  if (isEmpty(email)) {
    errors.email = "Email Required";
  }

  // * password Validation's
  // ? let password = "joiRoot11!"
  // ? isStrongPassword   =   minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1
  // if (!isStrongPassword(password)) {
  //   errors.password = 'Password must contain atleast 1 Lowercase, Uppercase, Number, Symbol and 8 character long';
  // }

  return {
    errors,
    valid: Object.keys(errors).length < 1,
  };
};

module.exports = {
  userRegistrationValidator,
};
