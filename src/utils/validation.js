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

const MoeOnBoardingValidation = (params) => {
  const { name, adminEmail, telephone, contactEmail, siteUrl } = params;
  const errors = {};

  // * Name Validation's

  if (!/^[a-zA-Z]+$/.test(name)) {
    errors.name = "Name contain letters only.";
  }

  if (
    !isLength(name, {
      min: 3,
      max: 20,
    })
  ) {
    errors.name = "Name must be in range of 3-20 characters.";
  }

  if (isEmpty(name)) {
    errors.name = "Name cannot be Empty.";
  }

  if (typeof name != "string") {
    errors.name = "Name must be a String.";
  }

  // * Admin Email Validation's
  if (!isEmail(adminEmail)) {
    errors.adminEmail = "Invalid Email";
  }
  if (isEmpty(adminEmail)) {
    errors.adminEmail = "Email cannot be Empty.";
  }

  // * Contact Email Validation's
  if (!isEmail(contactEmail)) {
    errors.contactEmail = "Invalid contact email";
  }
  if (isEmpty(contactEmail)) {
    errors.contactEmail = "Contact email cannot be Empty.";
  }

  // * telePhone
  if (isEmpty(telephone)) {
    errors.telephone = "Phone cannot be Empty.";
  }

  // * siteUrl
  if (typeof siteUrl != "string") {
    errors.siteUrl = "siteUrl must be a String.";
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

const issuerOnBoardingValidation = (params) => {
  const { type, name, adminEmail, telephone, description, siteUrl } = params;
  const errors = {};

  if (isEmpty(type)) {
    errors.type = "Type can not be Empty.";
  }

  // * Name Validation's

  if (!/^[a-zA-Z]+$/.test(name)) {
    errors.name = "Name contain letters only.";
  }

  if (
    !isLength(name, {
      min: 3,
      max: 20,
    })
  ) {
    errors.name = "Name must be in range of 3-20 characters.";
  }

  if (isEmpty(name)) {
    errors.name = "Name cannot be Empty.";
  }

  if (typeof name != "string") {
    errors.name = "Name must be a String.";
  }

  // * Admin Email Validation's
  if (!isEmail(adminEmail)) {
    errors.adminEmail = "Invalid Email";
  }
  if (isEmpty(adminEmail)) {
    errors.adminEmail = "Email cannot be Empty.";
  }

  // * telePhone
  if (isEmpty(telephone)) {
    errors.telephone = "Phone cannot be Empty.";
  }

  // * siteUrl
  if (typeof siteUrl != "string") {
    errors.siteUrl = "siteUrl must be a String.";
  }

  if (isEmpty(telephone)) {
    errors.telephone = "Phone cannot be Empty.";
  }

  if (isEmpty(description)) {
    errors.description = "Description cannot be Empty.";
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
  MoeOnBoardingValidation,
  issuerOnBoardingValidation,
};
