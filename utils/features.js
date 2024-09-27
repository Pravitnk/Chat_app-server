import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import { getBase64, getSocket } from "../lib/helper.js";

const cookieOptions = {
  maxAge: 15 * 24 * 60 * 60 * 1000,
  sameSite: "none",
  httpOnly: true,
  secure: true,
};

//function to connect db in main file
const connectDB = async (url) => {
  try {
    const data = await mongoose.connect(url, {
      dbName: "Chat-App",
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    console.log(`Connected to DB : ${data.connection.host}`);
  } catch (err) {
    throw err;
  }
};

//function to generate token and save it to cookies in user.controller file
const sendToken = (res, user, code, message) => {
  const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);
  // console.log("sendtoken", token);

  return res.status(code).cookie("chat-token", token, cookieOptions).json({
    success: true,
    user,
    message,
    // privateKey, //Including private key in the response
  });
};

const signToken = (userId) => {
  return jwt.sign({ _id: userId }, process.env.JWT_SECRET);
};

//function to emmit user in chat.controller file
const emmitEvent = (req, event, users, data) => {
  const io = req.app.get("io");
  const userSocket = getSocket(users);
  io.to(userSocket).emit(event, data);
};

//fucntion to upload file on the cloudinary

const uploadFilesOnCloudinary = async (files = []) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      try {
        const base64 = getBase64(file);

        cloudinary.uploader.upload(
          base64,
          {
            resource_type: "auto",
            public_id: uuid(),
          },
          (error, result) => {
            if (error) {
              return reject(error);
            } else {
              return resolve(result);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  });

  try {
    const results = await Promise.all(uploadPromises);

    const formattedResult = results.map((result) => ({
      public_id: result.public_id,
      url: result.secure_url,
    }));

    return formattedResult;
  } catch (err) {
    throw new Error("Error in uploading files to cloudinary", { cause: err });
  }
};

//function to delete the files from cloudinary
const deleteFilesFromCloudinary = async (public_ids) => {
  try {
    if (!public_ids || !Array.isArray(public_ids)) {
      throw new Error("Invalid public_ids provided");
    }

    const deletionResults = await Promise.all(
      public_ids.map((public_id) => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader.destroy(public_id, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
        });
      })
    );

    return deletionResults;
  } catch (error) {
    throw new Error("Error deleting files from Cloudinary", error);
  }
};

export {
  connectDB,
  sendToken,
  signToken,
  cookieOptions,
  emmitEvent,
  deleteFilesFromCloudinary,
  uploadFilesOnCloudinary,
};
