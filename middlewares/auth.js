import jwt from "jsonwebtoken";
import { adminSecretKey } from "../app.js";
import { ErrorHandler, TryCatch } from "./error.js";
import { CHAT_APP } from "../constants/config.js";
import { User } from "../models/user.model.js";

// user authetication
const isAuthenticated = TryCatch((req, res, next) => {
  // console.log(req.cookies);
  const token = req.cookies[CHAT_APP];

  if (!token)
    return res.status(401).json({
      message: "please login to access this route",
    });

  const decodedData = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decodedData._id;

  next();
});

//audio call auth
const audioCallAuthenticated = TryCatch(async (req, res, next) => {
  const token = req.cookies[CHAT_APP];

  if (!token) {
    return res.status(401).json({
      message: "Please login to access this route",
    });
  }

  const decodedData = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await User.findById(decodedData._id); // Fetch the full user object

  if (!req.user) {
    return res.status(401).json({
      message: "User not found",
    });
  }

  next();
});

//admin authetication
const isAdminAuthenticated = (req, res, next) => {
  // console.log(req.cookies);
  const token = req.cookies["chatapp-admin-token"];

  if (!token)
    return res.status(401).json({
      message: "Only Admin can access this route",
    });

  const secretKey = jwt.verify(token, process.env.JWT_SECRET);

  const isMatched = secretKey === adminSecretKey;

  if (!isMatched)
    next(new ErrorHandler("Only Admin can access this route", 401));

  next();
};

const socketAuthenticator = async (err, socket, next) => {
  try {
    if (err) return next(err);

    const authToken = socket.request.cookies[CHAT_APP];

    if (!authToken)
      return next(new ErrorHandler("Please login to access this route", 400));

    const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);

    const user = await User.findById(decodedData._id);

    if (!user)
      return next(new ErrorHandler("Please Login tp access this route", 400));

    socket.user = user;

    return next();
  } catch (error) {
    console.log(error);
    return next(new ErrorHandler("Please Login tp access this route", 400));
  }
};

export {
  isAuthenticated,
  isAdminAuthenticated,
  socketAuthenticator,
  audioCallAuthenticated,
};
