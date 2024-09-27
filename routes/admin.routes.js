import express from "express";
import {
  adminDashbord,
  adminLogin,
  adminLogout,
  allChats,
  allMessages,
  getAdminData,
  getAllUsers,
} from "../controllers/admin.controller.js";
import { adminLoginValidator, validate } from "../middlewares/validators.js";
import { isAdminAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

//routes as follows
app.post("/verify", adminLoginValidator(), validate, adminLogin);
app.get("/logout", adminLogout);

//only admin can access these following routes
app.use(isAdminAuthenticated);

app.get("/", getAdminData);

app.get("/users", getAllUsers);
app.get("/chats", allChats);
app.get("/messages", allMessages);

app.get("/stats", adminDashbord);

export default app;
