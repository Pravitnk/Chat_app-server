import { envMode } from "../app.js";

const errorMiddleware = (err, req, res, next) => {
  // err.message = err.message || "Internal server error";
  err.message ||= "Internal server error";
  // err.statusCode = err.statusCode || 500;
  err.statusCode ||= 500;

  if (err.code === 11000) {
    const duplicateKeyError = Object.keys(err.keyPattern).join(",");
    err.message = `Duplicate field ${duplicateKeyError}`;
    err.statusCode = 400;
  }

  if (err.name === "CastError") {
    const errorPath = err.path;
    err.message = `Invalid forest of ${errorPath}`;
    err.statusCode = 400;
  }

  const response = {
    success: false,
    message: err.message,
  };

  if (envMode === "DEVELOPMENT") {
    response.error = err;
  }

  return res.status(err.statusCode).json(response);
};

const TryCatch = (passedFunc) => async (req, res, next) => {
  try {
    await passedFunc(req, res, next);
  } catch (error) {
    next(error);
  }
};

const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => next(err));
  };
};

class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export { errorMiddleware, TryCatch, catchAsync, ErrorHandler };
