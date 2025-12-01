FROM node:20  
WORKDIR /app  
COPY package.json package-lock.json ./  
RUN npm ci  
COPY . .  
EXPOSE 3000  
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0  
CMD ["node", "--input-type=module", "-e", "import { createServer } from 'http'; const s=createServer((req,res)=>{res.writeHead(200);res.end('Shopify App OK');});s.listen(3000,'0.0.0.0',()=>console.log('Server started'));"]  
