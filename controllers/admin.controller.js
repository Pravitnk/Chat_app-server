import { ErrorHandler, TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.model.js";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";
import jwt from "jsonwebtoken";
import { cookieOptions } from "../utils/features.js";
import { adminSecretKey } from "../app.js";

// admin login controller
const adminLogin = TryCatch(async (req, res, next) => {
  const { secretKey } = req.body;

  const isMatched = secretKey === adminSecretKey;

  if (!isMatched) next(new ErrorHandler("Invalid Admin secretKey", 401));

  const token = jwt.sign(secretKey, process.env.JWT_SECRET);

  return res
    .status(200)
    .cookie("chatapp-admin-token", token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24,
    })
    .json({
      success: true,
      message: "Admin authenticated successfully",
    });
});

//admin logout controller
const adminLogout = TryCatch(async (req, res, next) => {
  return res
    .status(200)
    .cookie("chatapp-admin-token", "", {
      ...cookieOptions,
      maxAge: 0,
    })
    .json({
      success: true,
      message: "Admin logged out successfully",
    });
});

//get admin data controller
const getAdminData = TryCatch(async (req, res, next) => {
  return res.status(200).json({
    admin: true,
  });
});

// controller to show all users in a admin panel
const getAllUsers = TryCatch(async (req, res, next) => {
  const users = await User.find({});

  const tranformUsers = await Promise.all(
    users.map(async ({ _id, name, username, avatar }) => {
      const [groups, friends] = await Promise.all([
        Chat.countDocuments({ groupChat: true, members: _id }),
        Chat.countDocuments({ groupChat: false, members: _id }),
      ]);

      return {
        _id,
        name,
        username,
        avatar: avatar.url,
        groups,
        friends,
      };
    })
  );

  return res.status(200).json({
    success: true,
    users: tranformUsers,
  });
});

// controls to show all chats in a admin panel
const allChats = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({})
    .populate("members", "name avatar")
    .populate("creator", "name avatar");

  const transformChat = await Promise.all(
    chats.map(async ({ _id, name, members, groupChat, creator }) => {
      const totalMessages = await Message.countDocuments({ chat: _id });

      return {
        _id,
        groupChat,
        name,
        avatar: members.slice(0, 3).map((member) => member.avatar.url),
        members: members.map(({ _id, name, avatar }) => ({
          _id,
          name,
          avatar: avatar.url,
        })),
        creator: {
          name: creator?.name || "None",
          avatar: creator?.avatar.url || "",
        },
        totalMembers: members.length,
        totalMessages,
      };
    })
  );

  return res.status(200).json({
    success: true,
    chats: transformChat,
  });
});

// controller to show all messages in a admin panel
const allMessages = TryCatch(async (req, res, next) => {
  const messages = await Message.find({})
    .populate("sender", "name avatar")
    .populate("chat", "groupChat");

  const transformMessages = messages.map(
    ({ content, attachments, _id, sender, createdAt, chat }) => ({
      _id,
      attachments,
      content,
      createdAt,
      chat: chat._id,
      groupChat: chat.groupChat,
      sender: {
        _id: sender._id,
        name: sender.name,
        avatar: sender.avatar.url,
      },
    })
  );

  return res.status(200).json({
    success: true,
    messages: transformMessages,
  });
});

// controller to show all the stats in the admin dashboard

const adminDashbord = TryCatch(async (req, res, next) => {
  const [groupsCount, userCount, messagesCount, chatsCount] = await Promise.all(
    [
      Chat.countDocuments({ groupChat: true }),
      User.countDocuments({}),
      Message.countDocuments({}),
      Chat.countDocuments({}),
    ]
  );

  const today = new Date();

  const last7days = new Date();
  last7days.setDate(last7days.getDate() - 7);

  const last7daysMessages = await Message.find({
    createdAt: {
      $gte: last7days,
      $lte: today,
    },
  }).select("createdAt");

  const messages = new Array(7).fill(0);
  const dayInMilisec = 1000 * 60 * 60 * 24;

  last7daysMessages.forEach((message) => {
    const indexApprox =
      (today.getTime() - message.createdAt.getTime()) / dayInMilisec;
    const index = Math.floor(indexApprox);

    messages[6 - index]++;
  });

  const stats = {
    groupsCount,
    userCount,
    messagesCount,
    chatsCount,
    messagesChart: messages,
  };

  return res.status(200).json({
    success: true,
    stats,
  });
});

export {
  adminLogin,
  adminLogout,
  getAdminData,
  getAllUsers,
  allChats,
  allMessages,
  adminDashbord,
};
