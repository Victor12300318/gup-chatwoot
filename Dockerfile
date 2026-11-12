FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --ignore-scripts

COPY . .

# Garante que o Prisma gere o cliente
RUN npx prisma generate

# Compila o TypeScript
RUN npm run build

EXPOSE 3000
EXPOSE 3006
EXPOSE 80

# O DATABASE_URL deve ser definido como env no Easypanel ou via Docker Compose
# Ex: DATABASE_URL="postgresql://usuario:senha@host:5432/nome_do_banco?schema=public"

CMD ["npm", "start"]
