FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js cli.js ./
COPY src/ ./src/
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
HEALTHCHECK --interval=15s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
