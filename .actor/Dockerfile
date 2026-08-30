# Actor Dockerfile for Media Link Extractor
FROM apify/actor-node-playwright-chrome:v0.0.1

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . ./

# Build the actor (if needed)
# RUN npm run build
