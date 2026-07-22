# Shalom Marine Nets — container image for Google Cloud Run.
# Cloud Run gives each instance an EMPTY, read-only-ish filesystem, so all real
# data lives in Firestore and all uploads go to Firebase Storage. See DEPLOY_FIREBASE.md.

FROM node:20-slim

# Cloud Run sets PORT (8080). server.js already reads process.env.PORT.
ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Install deps first so Docker can cache this layer between code changes.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source
COPY . .

# /app/data and the uploads dir must exist and be writable by the runtime user.
# They are scratch space only — Firestore and Firebase Storage hold the real data.
RUN mkdir -p /app/data /app/public/uploads && chown -R node:node /app

USER node
EXPOSE 8080
CMD ["node", "server.js"]
