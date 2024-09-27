import { userSocketIds } from "../app.js";

const getOtherMember = (members, userId) => {
  return members.find((member) => member._id.toString() !== userId.toString());
};

const getSocket = (users = []) => {
  const sockets = users.map((user) => userSocketIds.get(user.toString()));
  return sockets;
};

const getBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
};

export { getOtherMember, getSocket, getBase64 };
