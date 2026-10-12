FROM node:20-alpine

WORKDIR /app
COPY laheta_kilpailu.js ./
COPY lib ./lib

ENTRYPOINT ["node", "laheta_kilpailu.js"]
CMD ["--help"]
