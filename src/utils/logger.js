import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(path.dirname(path.dirname(__dirname)), 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Write all logs to files
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log',),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console logging for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = '';
        if (Object.keys(meta).length) {
          try {
            // Safe stringify that handles circular references
            metaStr = ` ${JSON.stringify(meta, (key, value) => {
              // Skip circular references and complex objects
              if (value && typeof value === 'object') {
                // Skip HTTP request/response objects that contain circular references
                if (value.constructor && (
                  value.constructor.name === 'ClientRequest' ||
                  value.constructor.name === 'IncomingMessage' ||
                  value.constructor.name === 'TLSSocket' ||
                  value.constructor.name === 'Socket'
                )) {
                  return '[Circular Reference]';
                }
                // Handle other potential circular references
                if (value === meta) return '[Self Reference]';
              }
              return value;
            })}`;
          } catch (err) {
            metaStr = ` [Logging Error: ${err.message}]`;
          }
        }
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    )
  }));
}

export { logger };