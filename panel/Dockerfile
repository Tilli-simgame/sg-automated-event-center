FROM node:20-alpine

WORKDIR /app
COPY lib ./lib
COPY panel ./panel

ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

CMD ["node", "panel/server.js"]
