import express from "express";
import { connectDB } from "./utils/features.js";
import dotenv from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import { v4 as uuid } from "uuid";
import { getSocket } from "./lib/helper.js";
import { Message } from "./models/message.model.js";
import { User } from "./models/user.model.js";
import { AudioCall } from "./models/audioCall.js";
import { VideoCall } from "./models/video_call.js";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import userRoute from "./routes/user.routes.js";
import chatRoute from "./routes/chat.routes.js";
import adminRoute from "./routes/admin.routes.js";
import {
  CHAT_JOINED,
  CHAT_LEFT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";

// import {
//   createMessage,
//   createMessageInAChat,
//   sampleChats,
//   sampleGroupChats,
// } from "./seeders/user.js";

// import { NEW_MESSAGES } from "./constants/events.js";

// import { creatUser } from "./seeders/user.js";
// creatUser(15);

dotenv.config({ path: "./.env" });
connectDB(process.env.MONGO_URL);
const port = process.env.PORT || 3000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";
const adminSecretKey = process.env.ADMIN_SECRET_KEY || "edmenthusist";

// sampleChats(10);
// sampleGroupChats(10);
// createMessage(5);
// createMessageInAChat("663f6d6fac2427a5b8e6f661", 2);
const userSocketIds = new Map();
const onlineUsers = new Set();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);

//middelware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);

app.get("/", (req, res) => {
  res.send("Home page!");
});

// establishing socket connection
io.use((socket, next) => {
  cookieParser()(
    socket.request,
    socket.request.res,
    async (err) => await socketAuthenticator(err, socket, next)
  );
});
io.on("connection", (socket) => {
  // console.log("A user connected", socket.id);

  const user = socket.user;

  userSocketIds.set(user._id.toString(), socket.id);
  // console.log("socket", userSocketIds);

  socket.on("NEW_MESSAGES", async ({ chatId, members, message }) => {
    const messageForRealTime = {
      content: message,
      _id: uuid(),
      sender: {
        _id: user._id,
        name: user.name,
      },
      chat: chatId,
      createdAt: new Date().toISOString(),
    };

    const messaegForDB = {
      content: message,
      sender: user._id,
      chat: chatId,
    };

    console.log("Emmiting..", messageForRealTime);
    const memberSocket = getSocket(members);
    io.to(memberSocket).emit("NEW_MESSAGES", {
      chatId,
      message: messageForRealTime,
    });
    io.to(memberSocket).emit("NEW_MESSAGE_ALERT", { chatId });

    // console.log("Received new Message:-", messageForRealTime);
    try {
      await Message.create(messaegForDB);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on(START_TYPING, ({ members, chatId }) => {
    // console.log("start typing");
    const membersSocket = getSocket(members);
    socket.to(membersSocket).emit(START_TYPING, { chatId });
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    // console.log("stop typing");

    const membersSocket = getSocket(members);
    socket.to(membersSocket).emit(STOP_TYPING, { chatId });
  });

  //chat join and left
  socket.on(CHAT_JOINED, ({ userId, members }) => {
    onlineUsers.add(userId.toString());

    const membersSocket = getSocket(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on(CHAT_LEFT, ({ userId, members }) => {
    onlineUsers.delete(userId.toString());

    const membersSocket = getSocket(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  // -------------- HANDLE AUDIO CALL SOCKET EVENTS ----------------- //

  // handle start_audio_call event
  socket.on("start_audio_call", async (data) => {
    try {
      const { from, to, roomID } = data;
      const to_user = await User.findById(to);
      const from_user = await User.findById(from);

      const socket_id = userSocketIds.get(to_user._id.toString());

      if (to_user && from_user) {
        io.to(socket_id).emit("audio_call_notification", {
          from: from_user,
          roomID,
          streamID: from,
          userID: to,
          userName: to_user.username, // Ensure correct username is sent
        });
      } else {
        console.error("User not found");
      }
    } catch (error) {
      console.error("Error in start_audio_call:", error);
    }
  });

  // handle audio_call_not_picked
  socket.on("audio_call_not_picked", async (data) => {
    // find and update call record
    try {
      const { to, from } = data;
      const to_user = await User.findById(to);

      await AudioCall.findOneAndUpdate(
        { participants: { $size: 2, $all: [to, from] } },
        { verdict: "Missed", status: "Ended", endedAt: Date.now() }
      );

      if (to_user) {
        io.to(to_user.socket_id).emit("audio_call_missed", { from, to });
      }
    } catch (error) {
      console.error("Error in audio_call_not_picked:", error);
    }
  });

  // handle audio_call_accepted
  socket.on("audio_call_accepted", async (data) => {
    const { to, from } = data;

    try {
      console.log("audio call accepted");

      const from_user = await User.findById(from);

      await AudioCall.findOneAndUpdate(
        {
          participants: { $size: 2, $all: [to, from] },
        },
        { verdict: "Accepted" }
      );
      const socket_id = userSocketIds.get(from_user._id.toString());

      if (from_user) {
        io.to(socket_id).emit("audio_call_accepted", { from, to });
      } else {
        console.error("Sender not found");
      }
    } catch (error) {
      console.error("Error in audio_call_accepted:", error);
    }
  });

  // handle audio_call_denied
  socket.on("audio_call_denied", async (data) => {
    const { to, from } = data;

    try {
      await AudioCall.findOneAndUpdate(
        {
          participants: { $size: 2, $all: [to, from] },
        },
        { verdict: "Denied", status: "Ended", endedAt: Date.now() }
      );

      const from_user = await User.findById(from);
      const socket_id = userSocketIds.get(from_user._id.toString());
      console.log("deny 1", socket_id);
      if (from_user) {
        io.to(socket_id).emit("audio_call_denied", { from, to });
      } else {
        console.error("Sender not found");
      }
    } catch (error) {
      console.error("Error in audio_call_denied:", error);
    }
  });

  // handle user_is_busy_audio_call
  socket.on("user_is_busy_audio_call", async (data) => {
    const { to, from } = data;

    try {
      await AudioCall.findOneAndUpdate(
        {
          participants: { $size: 2, $all: [to, from] },
        },
        { verdict: "Busy", status: "Ended", endedAt: Date.now() }
      );

      const from_user = await User.findById(from);
      const socket_id = userSocketIds.get(from_user._id.toString());
      if (from_user) {
        io.to(socket_id).emit("on_another_audio_call", { from, to });
      } else {
        console.error("Sender not found");
      }
    } catch (error) {
      console.error("Error in user_is_busy_audio_call:", error);
    }
  });

  // --------------------- HANDLE VIDEO CALL SOCKET EVENTS ---------------------- //

  // handle start_video_call event
  socket.on("start_video_call", async (data) => {
    const { from, to, roomID } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    const socket_id = userSocketIds.get(to_user._id.toString());
    console.log("socket_id notification", socket_id);
    // send notification to receiver of call
    io.to(socket_id).emit("video_call_notification", {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle video_call_not_picked
  socket.on("video_call_not_picked", async (data) => {
    // find and update call record
    const { from, to } = data;

    const to_user = await User.findById(to);

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Missed", status: "Ended", endedAt: Date.now() }
    );

    const socket_id = userSocketIds.get(to_user._id.toString());
    // TODO => emit call_missed to receiver of call
    io.to(socket_id).emit("video_call_missed", {
      from,
      to,
    });
  });

  // handle video_call_accepted
  socket.on("video_call_accepted", async (data) => {
    const { from, to, streamID, roomID } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Accepted" }
    );

    const socket_id = userSocketIds.get(from_user._id.toString());
    // TODO => emit call_accepted to sender of call
    io.to(socket_id).emit("video_call_accepted", {
      from,
      to,
      streamID,
      roomID,
    });
  });

  // handle video_call_denied
  socket.on("video_call_denied", async (data) => {
    // find and update call record
    const { to, from } = data;

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Denied", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);

    const socket_id = userSocketIds.get(from_user._id.toString());
    // TODO => emit call_denied to sender of call

    io.to(socket_id).emit("video_call_denied", {
      from,
      to,
    });
  });

  // handle user_is_busy_video_call
  socket.on("user_is_busy_video_call", async (data) => {
    const { to, from } = data;
    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: "Busy", status: "Ended", endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_video_call to sender of call
    const socket_id = userSocketIds.get(from_user._id.toString());

    io.to(socket_id).emit("on_another_video_call", {
      from,
      to,
    });
  });

  //disconnect
  socket.on("disconnect", () => {
    userSocketIds.delete(user._id.toString());
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });
});

app.use(errorMiddleware);

server.listen(port, () => {
  console.log(`server running on port: ${port} in ${envMode} mode`);
});

export { envMode, adminSecretKey, userSocketIds, io };
