import express from "express";
import {
  acceptFriendRequest,
  forgot_password,
  getMYFriends,
  getMyProfile,
  getNotifications,
  getUserById,
  logOut,
  login,
  newUser,
  reset_password,
  searchUser,
  sendFriendRequest,
  sendOPT,
  updateUserProfile,
  verifyOTP,
} from "../controllers/user.controller.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";
import {
  acceptFriendRequestValidator,
  loginValidator,
  registerValidator,
  sendFriendRequestValidator,
  validate,
} from "../middlewares/validators.js";

const app = express.Router();

app.post("/signUp", singleAvatar, registerValidator(), validate, newUser);
// app.get("/:userId", getUserById);
app.post("/login", loginValidator(), validate, login);

app.post("/send-otp", sendOPT);
app.post("/verify-otp", verifyOTP);
app.post("/forgot-password", forgot_password);
app.post("/reset-password", reset_password);

//after here user must be logged in to access the routes

app.use(isAuthenticated);
app.get("/myProfile", getMyProfile);
app.put("/update-profile", singleAvatar, updateUserProfile);

app.get("/logout", logOut);
app.get("/search", searchUser);
app.put(
  "/send-request",
  sendFriendRequestValidator(),
  validate,
  sendFriendRequest
);
app.put(
  "/accept-request",
  acceptFriendRequestValidator(),
  validate,
  acceptFriendRequest
);

app.get("/notificaions", getNotifications);
app.get("/my-friends", getMYFriends);

export default app;
