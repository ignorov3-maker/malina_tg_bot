FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4174
ENV APP_DATA_DIR=/var/lib/malina

EXPOSE 4174

CMD ["npm", "start"]
