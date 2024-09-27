import mongoose from "mongoose";
const { model, models, Schema, Types } = mongoose;

const videoCallSchema = new Schema({
  participants: [
    {
      type: Types.ObjectId,
      ref: "User",
    },
  ],
  from: {
    type: Types.ObjectId,
    ref: "User",
  },
  to: {
    type: Types.ObjectId,
    ref: "User",
  },
  verdict: {
    type: String,
    enum: ["Accepted", "Denied", "Missed", "Busy"],
  },
  status: {
    type: String,
    enum: ["Ongoing", "Ended"],
  },
  startedAt: {
    type: Date,
    default: Date.now(),
  },
  endedAt: {
    type: Date,
  },
});
export const VideoCall =
  models.VideoCall || model("VideoCall", videoCallSchema);
