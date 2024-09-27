import { compare } from "bcrypt";
import { User } from "../models/user.model.js";
import {
  cookieOptions,
  deleteFilesFromCloudinary,
  emmitEvent,
  sendToken,
  signToken,
  uploadFilesOnCloudinary,
} from "../utils/features.js";
import { ErrorHandler, TryCatch, catchAsync } from "../middlewares/error.js";
import { Chat } from "../models/chat.model.js";
import { Request } from "../models/request.model.js";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/events.js";
import { getOtherMember } from "../lib/helper.js";
import optGenerator from "otp-generator";
import crypto from "crypto";
import { sendEmail } from "../services/mailer.js";
import { otp } from "../Tamplet/otp.js";
import { resetPassword } from "../Tamplet/resetPassword.js";
import bcrypt from "bcrypt";

const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    publicKey: publicKey.export({ type: "pkcs1", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs1", format: "pem" }),
  };
};

// Controller function to get user details by ID
const getUserById = TryCatch(async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user by ID
    const user = await User.findById(userId).select("publicKey"); // Select only the publicKey field

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Send the public key to the client
    res.status(200).json({
      success: true,
      publicKey: user.publicKey,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//create a new user and save it to database and save token to cookie
const newUser = TryCatch(async (req, res, next) => {
  const { name, email, username, password, bio } = req.body;

  const file = req.file;

  if (!file) return next(new ErrorHandler("Please upload Avatar", 400));

  const result = await uploadFilesOnCloudinary([file]);

  const avatar = {
    public_id: result[0].public_id,
    url: result[0].url,
  };

  // Generate public/private key pair
  // const { publicKey, privateKey } = generateKeyPair();

  const user = await User.create({
    name,
    email,
    username,
    password,
    bio,
    avatar,
    // publicKey,
  });

  // sendToken(res, user, 201, "New User created successfully", { privateKey });
  sendToken(res, user, 201, "New User created successfully");
});

//login the user and save token to cookie
const login = TryCatch(async (req, res, next) => {
  const { email, username, password } = req.body;
  console.log(email);

  try {
    const query = {};
    if (email) query.email = email;
    if (username) query.username = username;

    const user = await User.findOne(query).select("+password");

    if (!user) {
      return next(new ErrorHandler("Invalid username or email", 404));
    }

    const isPassMatch = await compare(password, user.password);

    if (!isPassMatch) {
      return next(new ErrorHandler("Invalid password", 404));
    }

    sendToken(res, user, 200, `Welcome to Home Page, ${user.name}`);
  } catch (error) {
    next(error);
  }
});

//send otp

const sendOPT = TryCatch(async (req, res, next) => {
  const { userId } = req.body;
  console.log(userId);
  console.log("log 1");

  const new_otp = optGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
  console.log("log 2", new_otp);

  // Calculate OTP expiry time
  const otp_expiry_time = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  console.log("log 3");

  const user = await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time,
  });

  if (!user) {
    console.error("User not found");
    return res.status(404).json({ success: false, message: "User not found" });
  }
  user.otp = new_otp.toString();

  console.log("log 4");
  await user.save();

  console.log("log 5");

  // Send an email to the user
  try {
    await sendEmail({
      from: "pravitnaik42@gmail.com",
      to: user.email,
      subject: "OTP verification",
      html: otp(user.name, new_otp), // Assuming `otp` is a function to generate HTML content
      attachments: [],
    });
    console.log("log 6");
  } catch (error) {
    console.error("Error sending email:", "error");
    return res
      .status(500)
      .json({ success: false, message: "Failed to send OTP email" });
  }

  res.status(200).json({
    success: true,
    new_otp,
    message: "OTP sent successfully",
  });
  console.log("log 7");
});

//verify OPT
const verifyOTP = TryCatch(async (req, res, next) => {
  console.log("start");
  // verify OPT and update the user record accordingly
  const { email, otp } = req.body;
  console.log("log 1");
  console.log(email, otp);

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  console.log(user);
  console.log("log 2");
  const currentTime = Date.now();
  console.log("Current time:", currentTime);

  if (!user) {
    return next(new ErrorHandler("email is invali or OTP expires", 404));
  }
  console.log("log 3");
  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    console.log("OTP is incorrect");
    return res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  console.log("log 4");

  //OTP is correct
  user.verified = true;
  user.otp = undefined;
  console.log("log 5");

  await user.save({ new: true, validateModifiedOnly: true });
  console.log("log 6");

  const token = signToken(user._id);
  console.log(token);
  // sendToken(res, user._id, 200, "new OTP");

  res.status(200).json({
    success: true,
    token,
    message: "logged in successfully",
  });
  console.log("log 7");
});

//forgot password
const forgot_password = TryCatch(async (req, res, next) => {
  // 1> get the user's email
  console.log("pass 1");
  const user = await User.findOne({ email: req.body.email });
  console.log("pass 2");

  if (!user) {
    return next(
      new ErrorHandler("There is no user with this email address", 404)
    );
  }
  console.log("pass 3");

  // 2> generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false }); // Ensure token is saved

  console.log("pass 4");

  // 3) Send it to user's email
  try {
    const resetURL = `http://localhost:5173/reset-password/?token=${resetToken}`;
    // TODO => Send Email with this Reset URL to user's email address
    console.log("pass 5");
    console.log(resetURL);

    await sendEmail({
      from: "pravitnaik42@gmail.com",
      to: user.email,
      subject: "Reset Password",
      html: resetPassword(user.name, resetURL), // Assuming `otp` is a function to generate HTML content
      attachments: [],
    });
    console.log("pass 6");

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
      resetURL,
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(500).json({
      message: "There was an error sending the email. Try again later!",
    });
  }
  console.log("pass 9");
});

//reset the password
const reset_password = TryCatch(async (req, res, next) => {
  //1> get the user based on the token

  const { token } = req.body;
  if (!token) {
    return next(new ErrorHandler("Token is missing", 400));
  }
  console.log("Received token:", token);

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  console.log("Hashed token:", hashedToken);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select("+passwordConfirm");
  console.log(user);
  //2> if token has expired or user is out of time window
  if (!user) {
    return next(new ErrorHandler("Token is invalid or expires", 400));
  }

  //3>update user's password and set reset token and expiry to undefined
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  //TODO send an email to user informing to the password

  //4> log in the user and send new jwt token
  const newToken = signToken(user._id);

  res.status(200).json({
    success: true,
    token: newToken,
    message: "password reset successfully",
  });
});

//after here user must be logged in to access the routes
//controller to display the user data / profile

const getMyProfile = TryCatch(async (req, res) => {
  const user = await User.findById(req.user);

  res.status(200).json({
    success: true,
    user,
  });
});

// controller to update profile info
const updateUserProfile = TryCatch(async (req, res, next) => {
  const { name, email, username, password, bio } = req.body;
  console.log("log 1");
  // Find the user by ID
  const user = await User.findById(req.user);
  const file = req.file;
  let avatar = {};
  console.log("log 2");

  // Check if a new avatar file was uploaded
  if (file) {
    const result = await uploadFilesOnCloudinary([file]);
    avatar = {
      public_id: result[0].public_id,
      url: result[0].url,
    };
    console.log("log 3");

    // If there's an existing avatar, delete it from Cloudinary
    if (user.avatar && user.avatar.public_id) {
      await deleteFilesFromCloudinary([user.avatar.public_id]);
    }
  }
  console.log("log 4");

  // If the user is not found, return an error
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  console.log("log 5");

  // Update user fields
  if (name) user.name = name;
  if (email !== undefined) user.email = email; // Update email if provided

  if (username) user.username = username;
  if (bio) user.bio = bio;

  console.log("log 6");

  // Update the avatar if it exists
  if (avatar.url) {
    user.avatar = avatar;
  }
  console.log("log 7");

  // Update the password if it is provided
  if (password) {
    user.password = password;
  }
  console.log("log 8");

  // Save the user with the updated data (this will trigger pre-save hooks)
  await user.save();
  console.log("log 9");

  // Respond with the updated user
  res.status(200).json({
    success: true,
    user,
    message: "User Profile Updated successfully...",
  });
  console.log("log 10");
});

// logout controller to logout and clear the token stored in cookies
const logOut = TryCatch(async (req, res) => {
  res
    .status(200)
    .cookie("chat-token", "", { ...cookieOptions, maxAge: 0 })
    .json({
      success: true,
      message: "User logged out successfully",
    });
});

// search controller to search a perticular user
const searchUser = TryCatch(async (req, res) => {
  const { name } = req.query;

  const myChats = await Chat.find({ groupChat: false, members: req.user });

  //Extracting the all users from mychat list i.e either friend or people i have chatted with
  const allUsersFromMyChat = myChats.flatMap((chat) => chat.members).flat();

  // all user i have not chatted with
  const allUsersExpectMyFriend = await User.find({
    _id: { $nin: allUsersFromMyChat },
    name: { $regex: name, $options: "i" },
  });

  // modifying the response
  const users = allUsersExpectMyFriend.map(({ _id, name, avatar }) => ({
    _id,
    name,
    avatar: avatar.url,
  }));

  return res.status(200).json({
    success: true,
    users,
  });
});

// send friend request controller
const sendFriendRequest = TryCatch(async (req, res, next) => {
  const { userId } = req.body;

  const request = await Request.findOne({
    $or: [
      { sender: req.user, receiver: userId },
      { sender: userId, receiver: req.user },
    ],
  });

  if (request)
    return next(new ErrorHandler("Request has already sent...", 400));

  await Request.create({
    sender: req.user,
    receiver: userId,
  });

  emmitEvent(req, NEW_REQUEST, [userId]);

  return res.status(200).json({
    success: true,
    message: "Friend request sent",
  });
});

// accept friend request controller
const acceptFriendRequest = TryCatch(async (req, res, next) => {
  const { requestId, accept } = req.body;

  const request = await Request.findById(requestId)
    .populate("sender", "name")
    .populate("receiver", "name");

  if (!request) return next(new ErrorHandler("Request not found", 400));

  // if not authorizes to accept this request
  if (request.receiver._id.toString() !== req.user.toString())
    return next(
      new ErrorHandler("You are not authorized to accept this request", 400)
    );

  if (!accept) {
    await request.deleteOne();
    return res.status(200).json({
      success: true,
      message: "Friend request rejected",
    });
  }
  const members = [request.sender._id, request.receiver._id];

  await Promise.all([
    Chat.create({
      members,
      name: `${request.sender.name}-${request.receiver.name}`,
    }),
    request.deleteOne(),
  ]);

  emmitEvent(req, REFETCH_CHATS, members);

  return res.status(200).json({
    success: true,
    message: "Friend request accepted",
    senderId: request.sender._id,
  });
});

// get your notifications controller
const getNotifications = TryCatch(async (req, res) => {
  const requests = await Request.find({ receiver: req.user }).populate(
    "sender",
    "name avatar"
  );

  const allRequests = requests.map(({ _id, sender }) => ({
    _id,
    sender: {
      _id: sender._id,
      name: sender.name,
      avatar: sender.avatar.url,
    },
  }));

  return res.status(200).json({
    success: true,
    AllRequests: allRequests,
  });
});

// get my friend list controller
// const getMYFriends = TryCatch(async (req, res, next) => {
//   console.log("log 1");
//   const chatId = req.query.chatId;
//   console.log("log 2");

//   const chats = await Chat.find({
//     members: req.user,
//     groupChat: false,
//   }).populate("members", "name avatar");
//   console.log("log 3");

//   const friends = chats.map(({ members }) => {
//     const otherUser = getOtherMember(members, req.user);
//     console.log("log 4");

//     return {
//       _id: otherUser._id,
//       name: otherUser.name,
//       avatar: otherUser.avatar.url,
//     };
//   });
//   console.log("log 5");

//   if (chatId) {
//     const chat = await Chat.findById(chatId);

//     const availableFriends = friends.filter(
//       (friend) => !chat.members.includes(friend._id)
//     );
//     console.log("log 6");

//     return res.status(200).json({
//       success: true,
//       friends: availableFriends,
//     });
//   } else {
//     console.log("log 7");

//     return res.status(200).json({
//       success: true,
//       friends,
//     });
//   }
// });

const getMYFriends = TryCatch(async (req, res, next) => {
  const chatId = req.query.chatId;

  try {
    const chats = await Chat.find({
      members: req.user,
      groupChat: false,
    }).populate("members", "name avatar");

    const friends = chats
      .map(({ members }) => {
        const otherUser = getOtherMember(members, req.user);

        if (!otherUser) {
          return null;
        }

        return {
          _id: otherUser._id,
          name: otherUser.name,
          avatar: otherUser.avatar.url,
        };
      })
      .filter((friend) => friend !== null); // filter out null results

    if (chatId) {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res
          .status(404)
          .json({ success: false, message: "Chat not found" });
      }

      const availableFriends = friends.filter(
        (friend) => !chat.members.includes(friend._id)
      );

      return res.status(200).json({
        success: true,
        friends: availableFriends,
      });
    } else {
      return res.status(200).json({
        success: true,
        friends,
      });
    }
  } catch (error) {
    console.error("log error -", error);
    next(error);
  }
});

export {
  getUserById,
  newUser,
  sendOPT,
  verifyOTP,
  forgot_password,
  reset_password,
  login,
  getMyProfile,
  updateUserProfile,
  logOut,
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  getNotifications,
  getMYFriends,
};
