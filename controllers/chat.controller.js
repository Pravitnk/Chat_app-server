import {
  ALERT,
  NEW_ATTACHMENT,
  NEW_MESSAGE_ALERT,
  REFETCH_CHATS,
} from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import { ErrorHandler, TryCatch } from "../middlewares/error.js";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { AudioCall } from "../models/audioCall.js";
import { VideoCall } from "../models/video_call.js";
import {
  deleteFilesFromCloudinary,
  emmitEvent,
  uploadFilesOnCloudinary,
} from "../utils/features.js";
import { io } from "../app.js";
import { generateToken04 } from "./zegoCloudServices.js";
import crypto from "crypto";

//controller to create a new group
const newGroupChat = TryCatch(async (req, res, next) => {
  const { name, members } = req.body;

  // if (members.length < 2)
  //   return next(new ErrorHandler("Group must have at least 3 members", 400));

  const allMembers = [...members, req.user];
  await Chat.create({
    name,
    groupChat: true,
    creator: req.user,
    members: allMembers,
  });

  emmitEvent(req, ALERT, allMembers, `welcome to ${name} group-chat`);
  emmitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "Group created",
  });
});

//controller to display my chats

// const getMyChats = TryCatch(async (req, res, next) => {
//   console.log("log 1");
//   const chats = await Chat.find({ members: req.user }).populate(
//     "members",
//     "name avatar"
//   );
//   console.log("log 2");

//   const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
//     const otherMember = getOtherMember(members, req.user);
//     console.log("log 3");

//     return {
//       _id,
//       groupChat,
//       avatar: groupChat
//         ? members.slice(0, 3).map(({ avatar }) => avatar.url)
//         : [otherMember.avatar.url],
//       name: groupChat ? name : otherMember.name,
//       members: members.reduce((prev, curr) => {
//         if (curr._id.toString() !== req.user.toString()) {
//           prev.push(curr._id);
//         }
//         return prev;
//       }, []),
//     };
//   });
//   console.log("log 4");

//   return res.status(201).json({
//     success: true,
//     chats: transformedChats,
//   });
// });

const getMyChats = TryCatch(async (req, res, next) => {
  try {
    const chats = await Chat.find({ members: req.user }).populate(
      "members",
      "name avatar"
    );

    const transformedChats = chats.map(({ _id, name, members, groupChat }) => {
      const otherMember = getOtherMember(members, req.user);

      // if (!otherMember) {
      //   console.error("Other member not found for user:", req.user);
      // }

      const memberAvatars = members
        .slice(0, 3)
        .map((member) => {
          if (member.avatar && member.avatar.url) {
            return member.avatar.url;
          } else {
            console.error("Avatar not defined for member:", member);
            return null; // or provide a default value
          }
        })
        .filter((url) => url !== null);

      return {
        _id,
        groupChat,
        avatar: groupChat ? memberAvatars : [otherMember?.avatar?.url || ""], // Use optional chaining and provide a default value
        name: groupChat ? name : otherMember?.name || "Unknown",
        members: members.reduce((prev, curr) => {
          if (curr._id.toString() !== req.user.toString()) {
            prev.push(curr._id);
          }
          return prev;
        }, []),
      };
    });

    return res.status(201).json({
      success: true,
      chats: transformedChats,
    });
  } catch (error) {
    console.error("An error occurred while fetching chats:", error);
    next(error);
  }
});

//controller to get all the groups in my list
const getMyGroups = TryCatch(async (req, res, next) => {
  const chats = await Chat.find({
    members: req.user,
    groupChat: true,
    creator: req.user,
  }).populate("members", "name avatar");

  const groups = chats.map(({ members, _id, groupChat, name }) => ({
    _id,
    groupChat,
    name,
    avatar: members.slice(0, 3).map(({ avatar }) => avatar.url),
  }));

  return res.status(200).json({
    success: true,
    groups,
  });
});

// controller to add members in group
const addMembers = TryCatch(async (req, res, next) => {
  const { chatId, members } = req.body;

  if (!members || members.length < 1)
    return next(new ErrorHandler("Please provide members", 400));

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  const AllNewMembersPromise = members.map((i) => User.findById(i, "name"));

  const AllNewMembers = await Promise.all(AllNewMembersPromise);

  const uniqueMembers = AllNewMembers.filter(
    (i) => !chat.members.includes(i._id.toString())
  ).map((i) => i._id);

  chat.members.push(...uniqueMembers);

  if (chat.members.length > 100)
    return next(
      new ErrorHandler(
        "Sorry you cant add anymore members as you have reached the maximum member adding limit"
      )
    );

  await chat.save();

  const allUsersName = AllNewMembers.map((i) => i.name).join(",");

  emmitEvent(
    req,
    ALERT,
    chat.members,
    `${allUsersName} has been added to ${chat.name} group`
  );

  emmitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "members added successfully",
  });
});

// controller to add members in group
const removeMembers = TryCatch(async (req, res, next) => {
  const { chatId, userId } = req.body;

  const [chat, userThatWiilBeRemoved] = await Promise.all([
    Chat.findById(chatId),
    User.findById(userId, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  if (chat.members.length <= 3)
    // return next(
    //   new ErrorHandler(
    //     "cannot remove anymore member since Group must have at least 3 members",
    //     400
    //   )
    // );
    return res.status(400).json({
      success: false,
      message:
        "cannot remove anymore member since Group must have at least 3 members",
    });

  const allChatMembers = chat.members.map((i) => i.toString());

  chat.members = chat.members.filter(
    (member) => member.toString() !== userId.toString()
  );

  await chat.save();

  emmitEvent(
    req,
    ALERT,
    chat.members,
    `${userThatWiilBeRemoved?.name} has been removed from the group`,
    {
      message: `${userThatWiilBeRemoved?.name} has been removed from the group`,
      chatId,
    }
  );

  emmitEvent(req, REFETCH_CHATS, allChatMembers);

  return res.status(200).json({
    success: true,
    message: "members removed successfully",
  });
});

// controller for leaving the group
const leaveGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  //counting the remaining members in the group
  const remainingMembers = chat.members.filter(
    (member) => member.toString() !== req.user.toString()
  );

  if (remainingMembers.length < 3)
    return next(new ErrorHandler("Group must have at least 3 members", 400));

  if (chat.creator.toString() === req.user.toString()) {
    const randomElement = Math.floor(Math.random() * remainingMembers.length);

    const newCreator = remainingMembers[randomElement];
    chat.creator = newCreator;
  }

  chat.members = remainingMembers;

  const [user] = await Promise.all([
    User.findById(req.user, "name"),
    chat.save(),
  ]);

  emmitEvent(req, ALERT, chat.members, `${user.name} has been left the group`, {
    message: `${user.name} has been left the group`,
    chatId,
  });

  return res.status(200).json({
    success: true,
    message: `${user.name} has left the group`,
  });
});

//cotroller to send file / attachments
const sendAttachments = TryCatch(async (req, res, next) => {
  const { chatId } = req.body;

  const files = req.files || [];

  if (files.length < 1)
    return next(new ErrorHandler("Please upload Attachments", 400));

  if (files.length > 5)
    return next(new ErrorHandler("Files should not be more than 5", 400));

  const [chat, me] = await Promise.all([
    Chat.findById(chatId),
    User.findById(req.user, "name"),
  ]);

  if (!chat) return next(new ErrorHandler("chat is not found", 400));

  //upload files here

  const attachments = await uploadFilesOnCloudinary(files);

  // const encryptMessage = (message, publicKey) => {
  //   const bufferMessage = Buffer.from(message, "utf-8");
  //   const encrypted = crypto.publicEncrypt(publicKey, bufferMessage);
  //   return encrypted.toString("base64");
  // };

  // // Retrieve recipient's public key (example - adjust as needed)
  // const recipientPublicKey = chat.members.find(
  //   (member) => member._id !== req.user._id
  // ).publicKey;

  // if (!recipientPublicKey)
  //   return next(new ErrorHandler("Recipient public key not found", 400));

  // const encryptedContent = encryptMessage(messageContent, recipientPublicKey);

  const messageForDB = {
    content: "",
    // content: encryptedContent, // Encrypted message content
    attachments,
    sender: me._id,
    chat: chatId,
  };

  const messageForRealTime = {
    ...messageForDB,
    sender: {
      _id: me._id,
      name: me.name,
    },
  };

  const message = await Message.create(messageForDB);

  emmitEvent(req, "NEW_MESSAGES", chat.members, {
    message: messageForRealTime,
    chatId,
  });

  emmitEvent(req, NEW_MESSAGE_ALERT, chat.members, { chatId });

  return res.status(200).json({
    success: true,
    message,
  });
});

//get chat details
const getChatDetails = TryCatch(async (req, res, next) => {
  if (req.query.populate === "true") {
    const chat = await Chat.findById(req.params.id)
      .populate("members", "name avatar")
      .lean();

    if (!chat) return next(new ErrorHandler("Sorry chat is not found", 400));

    chat.members = chat.members.map(({ _id, name, avatar }) => ({
      _id,
      name,
      avatar: avatar.url,
    }));

    return res.status(200).json({
      success: true,
      chat,
    });
  } else {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return next(new ErrorHandler("Sorry chat is not found", 400));
    return res.status(200).json({
      success: true,
      chat,
    });
  }
});

//rename the group
const renameGroup = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;
  const { name } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Sorry chat is not found"), 400);

  if (!chat.groupChat)
    return next(new ErrorHandler("This is not a group chat", 400));

  if (chat.creator.toString() !== req.user.toString())
    return next(new ErrorHandler("You are not allowed to add members", 403));

  chat.name = name;

  await chat.save();

  emmitEvent(req, REFETCH_CHATS, chat.members);

  return res.status(200).json({
    success: true,
    message: "group renamed successfully",
  });
});

// controller for deleting the chats
const deleteChat = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Sorry chat is not found"), 404);

  const members = chat.members;

  if (chat.groupChat && chat.creator.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not allowed to delete these chats"),
      400
    );

  if (!chat.groupChat && !chat.members.includes(req.user.toString()))
    return next(
      new ErrorHandler("You are not allowed to delete the chats", 400)
    );

  //here we have to delete all messages as well as all files or attachments from cloudinary
  const messagesWithAttachments = await Message.find({
    chat: chatId,
    attachments: { $exists: true, $ne: [] },
  });

  const public_ids = [];

  messagesWithAttachments.forEach(({ attachments }) => {
    attachments.forEach(({ public_id }) => public_ids.push(public_id));
  });

  await Promise.all([
    deleteFilesFromCloudinary(public_ids),
    chat.deleteOne(),
    Message.deleteMany({ chat: chatId }),
  ]);

  emmitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "Chat deleted Successfully",
  });
});

// controller to get / read messages
const getMessages = TryCatch(async (req, res, next) => {
  const chatId = req.params.id;

  const { page = 1 } = req.query;

  const resultPerPage = 20;
  const skip = (page - 1) * resultPerPage;

  const chat = await Chat.findById(chatId);

  if (!chat) return next(new ErrorHandler("Chat not found", 404));

  if (!chat.members.includes(req.user.toString()))
    return next(
      new ErrorHandler("You are not allowed to access this chat", 403)
    );

  const [messages, totalMessagesCount] = await Promise.all([
    Message.find({ chat: chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(resultPerPage)
      .populate("sender", "name")
      .lean(),
    Message.countDocuments({ chat: chatId }),
  ]);

  const totalPages = Math.ceil(totalMessagesCount / resultPerPage || 0);

  return res.status(200).json({
    success: true,
    message: messages.reverse(),
    totalPages,
  });
});

// audio and video calls controllers
/**
 * Authorization authentication token generation
 */

const generateZegoToken = TryCatch(async (req, res, next) => {
  try {
    const { userId, roomId } = req.body;
    console.log("log 1");

    const effectiveTimeInSeconds = 3600; // Token expiration time in seconds
    const payloadObject = {
      roomId,
      privilege: {
        1: 1, // loginRoom: 1 pass , 0 not pass
        2: 1, // publishStream: 1 pass , 0 not pass
      },
      stream_id_list: null,
    };
    console.log("log 2");

    const appID = parseInt(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SECRET_KEY;
    const payload = JSON.stringify(payloadObject);
    console.log("log 3");

    const token = generateToken04(
      appID,
      userId,
      serverSecret,
      effectiveTimeInSeconds,
      payload
    );
    console.log("log 4");

    res.status(200).json({
      status: "success",
      message: "Token generated successfully",
      token,
    });
    console.log("token", token);
  } catch (err) {
    console.error("Error generating Zego token:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to generate token" });
  }
  console.log("log 11");
});

// const startAudioCall = TryCatch(async (req, res, next) => {
//   console.log("start");
//   const from = req.user._id;
//   const to = req.body.id;
//   console.log("call 1");

//   const from_user = await User.findById(from);
//   const to_user = await User.findById(to);
//   console.log("call 2");

//   // create a new call audioCall Doc and send required data to client
//   const new_audio_call = await AudioCall.create({
//     participants: [from, to],
//     from,
//     to,
//     status: "Ongoing",
//   });
//   console.log("call 3");

//   res.status(200).json({
//     data: {
//       from: to_user,
//       roomID: new_audio_call._id,
//       streamID: to,
//       userID: from,
//       userName: from,
//     },
//   });
//   console.log(data);
// });

const startAudioCall = TryCatch(async (req, res, next) => {
  try {
    console.log("Request user:", req.user._id); // Debugging log
    const from = req.user._id;
    const to = req.body.id;
    console.log("log 1");
    if (!from) {
      return res.status(400).json({ message: "From user ID is required" });
    }
    console.log("log 2");

    if (!to) {
      return res.status(400).json({ message: "To user ID is required" });
    }
    console.log("log 3");

    if (from.toString() === to.toString()) {
      return res
        .status(400)
        .json({ message: "Cannot make a call to yourself" });
    }
    console.log("log 4");

    // Find users
    const from_user = req.user; //
    // const from_user = await User.findById(from);
    console.log("log 5");

    const to_user = await User.findById(to);
    console.log("log 6");

    if (!from_user) {
      return res.status(404).json({ message: "From user not found" });
    }
    console.log("log 7");

    if (!to_user) {
      return res.status(404).json({ message: "To user not found" });
    }
    console.log("log 8");

    // Create a new audio call document
    const new_audio_call = await AudioCall.create({
      participants: [from, to],
      from,
      to,
      status: "Ongoing",
    });
    console.log("log 9");

    // Respond with the required data
    res.status(200).json({
      data: {
        from: from_user,
        to: to_user,
        roomID: new_audio_call._id,
        streamID: to,
        userID: from,
        username: from_user.username, // Assuming user has a name field
      },
    });
    console.log("data:");
  } catch (error) {
    console.log("error", error);
    next(error); // Ensure proper error handling
  }
  console.log("end");
});

const startVideoCall = TryCatch(async (req, res, next) => {
  try {
    console.log("video 1", req.user._id);
    const from = req.user._id;
    const to = req.body.id;
    console.log(from, to);

    if (!from) {
      return res.status(400).json({ message: "From user ID is required" });
    }
    console.log("log 2");

    if (!to) {
      return res.status(400).json({ message: "To user ID is required" });
    }
    console.log("log 3");

    if (from.toString() === to.toString()) {
      return res
        .status(400)
        .json({ message: "Cannot make a call to yourself" });
    }
    console.log("log 4");

    // const from_user = await User.findById(from);
    const from_user = req.user; //

    const to_user = await User.findById(to);

    if (!from_user) {
      return res.status(404).json({ message: "From user not found" });
    }
    console.log("log 7");

    if (!to_user) {
      return res.status(404).json({ message: "To user not found" });
    }
    console.log("log 8");

    // create a new call videoCall Doc and send required data to client
    const new_video_call = await VideoCall.create({
      participants: [from, to],
      from,
      to,
      status: "Ongoing",
    });

    res.status(200).json({
      data: {
        from: from_user,
        to: to_user,
        roomID: new_video_call._id,
        streamID: to,
        userID: from,
        username: from_user.username, // Assuming user has a name field
      },
    });
    console.log("result is:");
  } catch (error) {
    console.log("error", error);
    next(error);
  }
});

const getCallLogs = TryCatch(async (req, res, next) => {
  const user_id = req.user._id;

  const call_logs = [];

  const audio_calls = await AudioCall.find({
    participants: { $all: [user_id] },
  }).populate("from to");

  const video_calls = await VideoCall.find({
    participants: { $all: [user_id] },
  }).populate("from to");

  console.log(audio_calls, video_calls);

  for (let elm of audio_calls) {
    const missed = elm.verdict !== "Accepted";
    if (elm.from._id.toString() === user_id.toString()) {
      const other_user = elm.to;

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    } else {
      // incoming
      const other_user = elm.from;

      // outgoing
      call_logs.push({
        id: elm._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    }
  }

  for (let element of video_calls) {
    const missed = element.verdict !== "Accepted";
    if (element.from._id.toString() === user_id.toString()) {
      const other_user = element.to;

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    } else {
      // incoming
      const other_user = element.from;

      // outgoing
      call_logs.push({
        id: element._id,
        img: other_user.avatar,
        name: other_user.firstName,
        online: true,
        incoming: false,
        missed,
      });
    }
  }

  res.status(200).json({
    status: "success",
    message: "Call Logs Found successfully!",
    data: call_logs,
  });
});

export {
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
  generateZegoToken,
  startAudioCall,
  startVideoCall,
  getCallLogs,
};
