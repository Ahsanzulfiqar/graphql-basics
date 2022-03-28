import {
  createLogger,
  format,
  transports
} from "winston"
const {
  combine,
  timestamp,
  label,
  printf,
  colorize,
  simple,
  errors,
  json
} = format;
import {
  NODE_ENV
} from "./config"

let logger

//* Logger for Development
function DevLogger() {
  //* Custom format for Development environment
  let devLoggerFormat = printf(({
    level,
    message,
    timestamp
  }) => {
    return `${level}: ${message} ${timestamp}`;
  });

  return createLogger({
    level: "debug",
    format: combine(
     
      timestamp({
        format: "YYYY-MM-DD HH:mm:ss"
      }),
      errors({
        stack: true
      }),
      devLoggerFormat,
      json()
    ),
    defaultMeta: {
      service: 'core-service'
    },
    transports: [new transports.Console()],
  });

}

//* Logger for production 
function ProdLogger() {
  //* Custom format for Production environment
  let prodLoggerFormat = printf(({
    level,
    message,
    timestamp
  }) => {
    return `${level}: ${message} ${timestamp}`;
  });

  return createLogger({
    level: "debug",
    format: combine(
      timestamp(),
      errors({
        stack: true
      }),
      prodLoggerFormat,
      json()
    ),
    defaultMeta: {
      service: 'core-service'
    },
    transports: [new transports.Console()],
  });
}

if (NODE_ENV == "development") {
  logger = DevLogger()
} else if (NODE_ENV == "production") {
  logger = ProdLogger()
}

export {
  logger
}