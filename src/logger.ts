import * as winston from "winston"; // Logging

// Setup winston logger
export const logger = winston.createLogger({
  level: "info",
  // Simple line-by-line output
  format: winston.format.simple(),
  transports: [
    // Print to console
    new winston.transports.Console(),
    // + Output to tweetdrop logfile
    new winston.transports.File({ filename: "tweetdrop.log" })
  ]
});
