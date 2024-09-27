import express from "express";
import {
  newGroupChat,
  getMyChats,
  getMyGroups,
  addMembers,
  removeMembers,
  leaveGroup,
  sendAttachments,
  getChatDetails,
  renameGroup,
  deleteChat,
  getMessages,
  startAudioCall,
  startVideoCall,
  getCallLogs,
  generateZegoToken,
} from "../controllers/chat.controller.js";
import {
  audioCallAuthenticated,
  isAuthenticated,
} from "../middlewares/auth.js";
import { attachmentFiles } from "../middlewares/multer.js";
import {
  addMembersValidator,
  chatIdValidator,
  leaveGroupValidator,
  newGroupValidator,
  removeMembersValidator,
  renameGroupValidator,
  sendAttachmentsValidator,
  validate,
} from "../middlewares/validators.js";

const app = express.Router();

//after here user must be logged in to access the routes

app.use(isAuthenticated);

app.post("/new", newGroupValidator(), validate, newGroupChat);

app.get("/myChats", getMyChats);

app.get("/my/groups", getMyGroups);

app.put("/addMembers", addMembersValidator(), validate, addMembers);

app.put("/removeMembers", removeMembersValidator(), validate, removeMembers);

app.delete("/leave/:id", leaveGroupValidator(), validate, leaveGroup);

//send attachments
app.post(
  "/message",
  attachmentFiles,
  sendAttachmentsValidator(),
  validate,
  sendAttachments
);

//get messages
app.get("/message/:id", chatIdValidator(), validate, getMessages);

//get chat details, rename, delete chat
app
  .route("/:id")
  .get(chatIdValidator(), validate, getChatDetails)
  .put(renameGroupValidator(), validate, renameGroup)
  .delete(chatIdValidator(), validate, deleteChat);

// Video call  video calls routes
app.post("/generate-zego-token", generateZegoToken);
app.get("/get-call-logs", getCallLogs);

app.post("/start-audio-call", audioCallAuthenticated, startAudioCall);
app.post("/start-video-call", audioCallAuthenticated, startVideoCall);
//

export default app;
