import { validationResult, body, param, oneOf } from "express-validator";
import { ErrorHandler } from "./error.js";

const registerValidator = () => [
  body("name", "Please Enter Name").notEmpty(),
  body("username", "Please Enter UserName").notEmpty(),
  body("password", "Please Enter Password").notEmpty(),
  body("bio", "Please fill the Bio").notEmpty(),
  // check("avatar", "Please upload Avatar").notEmpty(),
];

const loginValidator = () => [
  oneOf([
    body("username", "Please Enter UserName").notEmpty(),
    body("email", "Please Enter Email").notEmpty(),
  ]),
  body("password", "Please Enter Password").notEmpty(),
];

const newGroupValidator = () => [
  body("name", "Please Enter Name").notEmpty(),
  body("members")
    .notEmpty()
    .withMessage("Please add members")
    .isArray({ min: 2, max: 100 })
    .withMessage("Members in a group must be between 2 - 100"),
];

const addMembersValidator = () => [
  body("chatId", "Please Enter chat ID").notEmpty(),
  body("members")
    .notEmpty()
    .withMessage("Please add members")
    .isArray({ min: 1, max: 97 })
    .withMessage("Members in a group must be between 1 - 97"),
];

const removeMembersValidator = () => [
  body("chatId", "Please Enter Chat ID").notEmpty(),
  body("userId", "Please Enter User ID").notEmpty(),
];

const leaveGroupValidator = () => [
  param("id", "Please Enter Chat ID").notEmpty(),
];

const sendAttachmentsValidator = () => [
  body("chatId", "Please Enter Chat ID").notEmpty(),
];

const chatIdValidator = () => [param("id", "Please Enter Chat ID").notEmpty()];

const renameGroupValidator = () => [
  param("id", "Please Enter Chat ID").notEmpty(),
  body("name", "Please Enter New Name").notEmpty(),
];

const sendFriendRequestValidator = () => [
  body("userId", "Please Enter User ID").notEmpty(),
];

const acceptFriendRequestValidator = () => [
  body("requestId", "Please Enter Request ID").notEmpty(),
  body("accept")
    .notEmpty()
    .withMessage("Accept request")
    .isBoolean()
    .withMessage("accept must be Boolean"),
];

const adminLoginValidator = () => [
  body("secretKey", "Please Enter Secret Key").notEmpty(),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  const errorMessage = errors
    .array()
    .map((err) => err.msg)
    .join(", ");
  //   console.log(errorMessage);

  if (errors.isEmpty()) return next();
  else return next(new ErrorHandler(errorMessage, 400));
};

export {
  registerValidator,
  loginValidator,
  newGroupValidator,
  addMembersValidator,
  removeMembersValidator,
  leaveGroupValidator,
  sendAttachmentsValidator,
  chatIdValidator,
  renameGroupValidator,
  sendFriendRequestValidator,
  acceptFriendRequestValidator,
  adminLoginValidator,
  validate,
};
