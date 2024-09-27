const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    "*",
    process.env.CLIENT_URL,
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type, Authorization",

  credentials: true,
};

const CHAT_APP = "chat-token";

export { corsOptions, CHAT_APP };
